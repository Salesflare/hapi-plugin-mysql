'use strict';

const MySQL = require('mysql');
const Hoek = require('@hapi/hoek');

const internals = {
    pool: null
};

internals.attachConnection = async (request, h) => {

    await new Promise((resolve, reject) => {
    
        return internals.getConnection((err, conn) => {
    
            if (err) {
                return reject(err);
            }
    
            request.app.db = conn;
    
            return resolve();
        });
    });

    return h.continue;
};

exports.getConnection = internals.getConnection = (callback) => {

    Hoek.assert(internals.pool, 'No mysql pool found');

    return internals.pool.getConnection(callback);
};

internals.response = (request) => {

    if (request.app.db) {
        request.app.db.release();
    }
};

exports.stop = internals.stop = async () => {

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

exports.init = internals.init = async (baseOptions) => {

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

    if (!baseOptions.hasOwnProperty('host')) {
       throw new Error('Options must include host property');
    }

    const options = Hoek.clone(baseOptions);
    internals.pool = MySQL.createPool(options);

    // test connection
    return new Promise((resolve, reject) => {
    
        return internals.pool.getConnection((err, connection) => {

            if (err) {
                delete internals.pool;
                return reject(err);
            }
    
            // release test connection
            connection.release();
    
            return resolve();
        });
    });
}

exports.plugin = {
    pkg: require('../package.json'),
    register: async function (server, baseOptions) {

        await internals.init(baseOptions);

        // add connection to request object
        server.ext('onPreAuth', internals.attachConnection);

        // end connection after request finishes
        server.events.on('response', internals.response);

        // try to close pool on server end
        server.ext('onPostStop', internals.stop);

        // add getDb() function to `server`
        server.decorate('server', 'getDb', internals.getConnection);

        server.log(['hapi-plugin-mysql', 'database'], 'Connection to the database successfull');

        return;
    }
}
