'use strict';

const MySQL = require('mysql');
const Hoek = require('hoek');

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

internals.getConnection = (callback) => {

    Hoek.assert(internals.pool, 'No mysql pool found');

    return internals.pool.getConnection(callback);
};

internals.tail = (request) => {

    if (request.app.db) {
        request.app.db.release();
    }
};

internals.stop = (server, next) => {

    // This is also used for `on('stop')` which does not pass a `next` callback
    // But mysql handles that for us by simply throwing on error, which is what we would do
    return internals.pool.end(next);
};

exports.register = (server, baseOptions, next) => {

    Hoek.assert(baseOptions.hasOwnProperty('host'), 'Options must include host property');

    const options = Hoek.clone(baseOptions);
    internals.pool = MySQL.createPool(options);

    // test connection
    return internals.pool.getConnection((err, connection) => {

        Hoek.assert(!err, err);
        Hoek.assert(connection, 'Got no connection from pool');

        // release test connection
        connection.release();

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
