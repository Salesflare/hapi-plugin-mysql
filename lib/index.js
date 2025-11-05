'use strict';

const Util = require('util');

const MySQL = require('mysql');
const Hoek = require('@hapi/hoek');

const internals = {
    pool: null
};

internals.attachConnection = async (request, h) => {

    const connection = await internals.getConnection();

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

        return internals.pool.getConnection((err, connection) => {

            if (err) {
                return reject(err);
            }

            // Since commit/rollback/beginTransaction uses the .query it will auto promisify them
            // Node's `util.promisify` adds a symbol with the promisified version of the function
            // After promisifying `connection.query` also still works with callbacks
            connection.query = Util.promisify(connection.query);

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

        server.log(['hapi-plugin-mysql', 'database'], 'Connection to the database successful');
    }
};
