'use strict';

const Util = require('util');

const MySQL = require('mysql');
const Hoek = require('@hapi/hoek');

const internals = {
    pool: null,
    server: null,
    poolDiagnostics: false,
    slowAcquireThreshold: 5000, // 5 seconds before a connection attempt is logged as a slow acquire
    acquireWaitTimeout: 0, // Max ms to wait for the pool to hand out a connection, 0 disables the limit
    leakThreshold: 30000, // 30 seconds before activeConnection is logged as a leak
    leakCheckInterval: 60000, // 1 minute before the leak check interval starts
    cleanupThreshold: 240000 // 4 minutes before old connections get removed from the activeConnections map
};

const perfNow = () => Number(process.hrtime.bigint() / 1000000n); // Milliseconds

const activeConnections = new Map();

internals.attachConnection = async (request, h) => {

    const connection = await internals.getConnection({ info: `${request.method}:${request.route.path}` });

    if (internals.poolDiagnostics && connection?.threadId) {
        const info = activeConnections.get(connection.threadId);
        if (info) {
            info.route = request.route.path;
            info.method = request.method;
        }
    }

    request.app.db = connection;
    request.app.connection = connection;

    return h.continue;
};

/**
 * Returns a promise if no callback is provided
 * Promise will resolve with a promisified connection.query
 *
 * @param {Object} options - The options to pass to the connection pool
 * @param {function(Error, Object):void} callback
 * @returns {Promise | void}
 */
exports.getConnection = async (options = {}, callback) => {

    // If options is a function, assume options is the callback function and options is empty
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }

    let connection;
    try {
        connection = await internals.getConnection(options);
    }
    catch (err) {
        if (callback) {
            return callback(err);
        }

        throw err;
    }

    if (callback) {
        return callback(null, connection);
    }

    return connection;
};

internals.getConnection = (options = {}) => {

    Hoek.assert(internals.pool, 'No mysql pool found');

    return new Promise((resolve, reject) => {

        const startTime = perfNow();

        /* eslint-disable no-underscore-dangle */
        const stats = internals.poolDiagnostics ? {
            total: internals.pool._allConnections?.length ?? null,
            free: internals.pool._freeConnections?.length ?? null,
            acquiring: internals.pool._acquiringConnections?.length ?? null,
            queueLength: internals.pool._connectionQueue?.length ?? null
        } : null;
        /* eslint-enable no-underscore-dangle */

        // The mysql pool has no limit on how long a request can sit in its queue waiting for a free connection.
        // `acquireWaitTimeout` bounds that wait. When it fires we reject, but the pool still has our callback queued
        // so a connection can be handed out later. The `settled` flag makes that late callback release the
        // connection straight back to the pool instead of leaking it to a promise nobody is waiting on anymore.
        let settled = false;
        let timer = null;

        if (internals.acquireWaitTimeout > 0) {
            timer = setTimeout(() => {

                settled = true;

                const error = new Error(`Timed out after ${internals.acquireWaitTimeout}ms waiting for a mysql connection from the pool`);
                error.code = 'POOL_ACQUIRETIMEOUT';

                const statsInfo = stats ? `, totalConnections: ${stats.total}, freeConnections: ${stats.free}, acquiringConnections: ${stats.acquiring}, queueLength: ${stats.queueLength}` : '';
                internals.server?.log(['hapi-plugin-mysql', 'database', 'error'], `${error.message}${statsInfo}${options.info ? `, info: ${options.info}` : ''}`);

                return reject(error);
            }, internals.acquireWaitTimeout);
        }

        return internals.pool.getConnection((err, connection) => {

            clearTimeout(timer);

            if (settled) {
                // We already gave up on this acquire, hand the connection back immediately
                if (connection) {
                    connection.release();
                }

                return;
            }

            settled = true;

            if (err) {
                return reject(err);
            }

            // Since commit/rollback/beginTransaction uses the .query it will auto promisify them
            // Node's `util.promisify` adds a symbol with the promisified version of the function
            // After promisifying `connection.query` also still works with callbacks
            connection.query = Util.promisify(connection.query);

            if (internals.poolDiagnostics) {
                stats.acquireTime = perfNow() - startTime;
                stats.slowAcquire = stats.acquireTime > internals.slowAcquireThreshold;
                stats.info = options.info;
                connection.poolStats = stats;

                if (stats.slowAcquire) {
                    internals.server?.log(['hapi-plugin-mysql', 'database'], `Slow acquire: ${stats.acquireTime}ms, threadId: ${connection.threadId}, totalConnections: ${stats.total}, freeConnections: ${stats.free}, acquiringConnections: ${stats.acquiring}, queueLength: ${stats.queueLength}${options.info ? `, info: ${options.info}` : ''}`);
                }

                // Mark as “outstanding” in the registry
                const threadId = connection.threadId;
                const info = {
                    startTime: perfNow(),           // When given out
                    stats,               // Snapshot at acquire
                    route: undefined,        // We’ll fill these in attachConnection
                    method: undefined
                };
                activeConnections.set(threadId, info);

                // Intercept release() to auto-unregister (only once per connection object)
                // eslint-disable-next-line no-underscore-dangle
                if (!connection.__hapiPluginMysqlIntercepted) {
                    const origRelease = connection.release.bind(connection);
                    connection.release = function release() {

                        if (connection.threadId) {
                            activeConnections.delete(threadId);
                        }

                        return origRelease();
                    };

                    // eslint-disable-next-line no-underscore-dangle
                    connection.__hapiPluginMysqlIntercepted = true;
                }
            }

            return resolve(connection);
        });
    });
};

internals.response = (request) => {

    // Since db and connection is the same connection we only need to release once here
    if (request.app.db) {
        request.app.db.release();
    }
};

exports.stop = internals.stop = () => {

    return new Promise((resolve, reject) => {

        return internals.pool.end((err) => {

            delete internals.pool;

            if (err) {
                return reject(err);
            }

            return resolve();
        });
    });
};

exports.init = internals.init = async (baseOptions = {}) => {

    const hasOptions = Object.keys(baseOptions).length > 0;

    if (!internals.pool && !hasOptions) {
        throw new Error('No pool and no options to create one found, call `init` or `register` with options first');
    }

    if (internals.pool) {
        // Calling init and then register with no options should work
        if (!hasOptions) {
            return;
        }

        // Error on trying to init multiple times
        throw new Error('There is already a pool configured');
    }

    if (!Object.prototype.hasOwnProperty.call(baseOptions, 'host') && !Object.prototype.hasOwnProperty.call(baseOptions, 'socketPath')) {
        throw new Error('Options must include `host` or `socketPath` property');
    }

    const options = Hoek.clone(baseOptions);

    if (options.poolDiagnostics) {
        internals.poolDiagnostics = true;
        delete options.poolDiagnostics;
    }

    if (typeof options.slowAcquireThreshold === 'number' && options.slowAcquireThreshold >= 0) {
        internals.slowAcquireThreshold = options.slowAcquireThreshold;
        delete options.slowAcquireThreshold;
    }

    internals.acquireWaitTimeout = 0;
    if (Object.prototype.hasOwnProperty.call(options, 'acquireWaitTimeout')) {
        if (!Number.isInteger(options.acquireWaitTimeout) || options.acquireWaitTimeout < 0) {
            throw new Error('Option `acquireWaitTimeout` must be a non-negative integer (milliseconds)');
        }

        internals.acquireWaitTimeout = options.acquireWaitTimeout;
        delete options.acquireWaitTimeout; // Not a mysql option, don't pass it on to the pool
    }

    if (typeof options.leakThreshold === 'number' && options.leakThreshold >= 0) {
        internals.leakThreshold = options.leakThreshold;
        delete options.leakThreshold;
    }

    if (typeof options.leakCheckInterval === 'number' && options.leakCheckInterval >= 0) {
        internals.leakCheckInterval = options.leakCheckInterval;
        delete options.leakCheckInterval;
    }

    if (typeof options.cleanupThreshold === 'number' && options.cleanupThreshold >= 0) {
        internals.cleanupThreshold = options.cleanupThreshold;
        delete options.cleanupThreshold;
    }

    internals.pool = MySQL.createPool(options);

    // Test connection
    let connection;
    try {
        connection = await internals.getConnection();
    }
    catch (err) {
        // Close the pool instead of only dropping the reference. With `acquireWaitTimeout` the test acquire can still
        // complete later, and its late release would otherwise land in a pool nobody references anymore.
        const failedPool = internals.pool;
        delete internals.pool;
        failedPool.end(Hoek.ignore);
        throw err;
    }
    finally {
        // Release test connection
        if (connection) {
            connection.release();
        }
    }
};

exports.plugin = {
    pkg: require('../package.json'),
    register: async function (server, baseOptions) {

        await internals.init(baseOptions);

        // Add connection to request object
        server.ext('onPreAuth', internals.attachConnection);

        // End connection after request finishes
        server.events.on('response', internals.response);

        // Try to close pool on server end
        server.ext('onPostStop', internals.stop);

        // Add getDb() function to `server`
        server.decorate('server', 'getDb', exports.getConnection);
        server.decorate('server', 'getConnection', exports.getConnection);

        internals.server = server;

        if (internals.poolDiagnostics) {
            setInterval(() => {

                const now = perfNow();
                for (const [threadId, info] of activeConnections) {
                    const heldTime = now - info.startTime;
                    if (heldTime > internals.leakThreshold) {
                        internals.server?.log(['hapi-plugin-mysql', 'database'], `Connection held for ${heldTime / 1000}s, threadId: ${threadId}, route: ${info.route}, method: ${info.method}, info: ${info.stats.info}`);
                    }

                    if (heldTime > internals.cleanupThreshold) {
                        activeConnections.delete(threadId);
                    }
                }
            }, internals.leakCheckInterval).unref();
            // Unref ensures the interval is not kept the event loop alive
        }

        server.log(['hapi-plugin-mysql', 'database'], 'Connection to the database successful');
    }
};
