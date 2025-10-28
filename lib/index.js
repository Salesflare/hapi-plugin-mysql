'use strict';

const Util = require('util');

const MySQL = require('mysql');
const Hoek = require('@hapi/hoek');

const internals = {
    pool: null,
    server: null,
    poolDiagnostics: false
};

const perfNow = () => Number(process.hrtime.bigint() / 1000000n); // Milliseconds
const slowAcquireThreshold = 1000;
const leakThreshold = 120000; // 2 minutes
const leakCheckInterval = 60000; // 1 minute
const cleanupTreshold = 240000; // 4 minutes

const activeConnections = new Map();

internals.attachConnection = async (request, h) => {

    const connection = await internals.getConnection();

    if (internals.poolDiagnostics && connection?.threadId && activeConnections.has(connection.threadId)) {
        activeConnections.get(connection.threadId).route = request.route.path;
        activeConnections.get(connection.threadId).method = request.method;
    }

    request.app.db = connection;
    request.app.connection = connection;

    return h.continue;
};

/**
 * Returns a promise if no callback is provided
 * Promise will resolve with a promisified connection.query
 *
 * @param {function(Error, Object):void} callback
 * @returns {Promise | void}
 */
exports.getConnection = async (callback) => {

    let connection;
    try {
        connection = await internals.getConnection();
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

internals.getConnection = () => {

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

        return internals.pool.getConnection((err, connection) => {

            if (err) {
                return reject(err);
            }

            // Since commit/rollback/beginTransaction uses the .query it will auto promisify them
            // Node's `util.promisify` adds a symbol with the promisified version of the function
            // After promisifying `connection.query` also still works with callbacks
            connection.query = Util.promisify(connection.query);

            if (internals.poolDiagnostics) {
                stats.acquireTime = perfNow() - startTime;
                stats.slowAcquire = stats.acquireTime > slowAcquireThreshold;
                connection.poolStats = stats;

                if (stats.slowAcquire) {
                    internals.server?.log(['hapi-plugin-mysql', 'database'], `Slow acquire: ${stats.acquireTime}ms, threadId: ${connection.threadId}`);
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

                // Intercept release() to auto-unregister
                const origRelease = connection.release.bind(connection);
                connection.release = function release() {

                    activeConnections.delete(threadId);
                    return origRelease();
                };
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

    internals.pool = MySQL.createPool(options);

    // Test connection
    let connection;
    try {
        connection = await internals.getConnection();
    }
    catch (err) {
        delete internals.pool;
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
                    if (heldTime > leakThreshold) {
                        internals.server?.log(['hapi-plugin-mysql', 'database'], `Connection held for ${heldTime / 1000}s, threadId: ${threadId}, route: ${info.route}, method: ${info.method}`);
                    }

                    if (heldTime > cleanupTreshold) {
                        activeConnections.delete(threadId);
                    }
                }
            }, leakCheckInterval).unref();
            // Unref ensures the interval is not kept the event loop alive
        }

        server.log(['hapi-plugin-mysql', 'database'], 'Connection to the database successful');
    }
};
