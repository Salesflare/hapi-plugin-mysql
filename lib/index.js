'use strict';

const MySQL = require('mysql');
const Hoek = require('@hapi/hoek');

const internals = {
    pool: null
};

internals.attachConnection = (request, reply) => {

    return internals.getConnection((err, conn) => {

        Hoek.assert(!err, err);

        request.app.db = conn;

        return reply.continue();
    });
};

exports.getConnection = internals.getConnection = (callback) => {

    Hoek.assert(internals.pool, 'No mysql pool found');

    return internals.pool.getConnection(callback);
};

internals.tail = (request) => {

    if (request.app.db) {
        request.app.db.release();
    }
};

exports.stop = internals.stop = (server, next) => {

    if (typeof server === 'function' && !next) {
        next = server;
    }

    // This is also used for `on('stop')` which does not pass a `next` callback
    // If no callback we throw on error
    return internals.pool.end((err) => {
    
        delete internals.pool;

        return next ? next(err) : Hoek.assert(!err, err);
    });
};

exports.init = internals.init = (baseOptions, callback) => {

    const hasOptions = Object.keys(baseOptions).length > 0;

    if (!internals.pool && !hasOptions) {
        return callback(new Error('No pool and no options to create one found, call `init` or `register` with options first'));
    }
    
    if (internals.pool) {
        // Calling init and then register with no options should work
        if (!hasOptions) {
            return callback();
        }
        
        // Error on trying to init multiple times
        return callback(new Error('There is already a pool configured'));
    }

    if (!baseOptions.hasOwnProperty('host')) {
        return callback(new Error('Options must include host property'))
    }

    const options = Hoek.clone(baseOptions);
    internals.pool = MySQL.createPool(options);

    // test connection
    return internals.pool.getConnection((err, connection) => {

        if (err) {
            return callback(err);
        }

        // release test connection
        connection.release();

        return callback();
    });
}

exports.register = (server, baseOptions, next) => {

    return internals.init(baseOptions, (err) => {
    
        Hoek.assert(!err, err);    

        // add connection to request object
        if (server.connections) {
            server.ext('onPreAuth', internals.attachConnection);
        }

        // end connection after request finishes
        server.on('tail', internals.tail);

        // try to close pool on server end
        if (server.connections) {
            server.ext('onPostStop', internals.stop);
        }
        else {
            server.on('stop', internals.stop)
        }

        // add getDb() function to `server`
        server.decorate('server', 'getDb', internals.getConnection);

        server.log(['hapi-plugin-mysql', 'database'], 'Connection to the database successfull');

        return next();
    });
};

exports.register.attributes = {
    pkg: require('../package.json'),
    once: true,
    connections: 'conditional'
};
