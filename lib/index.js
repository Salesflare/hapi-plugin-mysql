'use strict';

const MySQL = require('mysql');
const Hoek = require('hoek');

const internals = {
    pool: null,
    logTags: ['hapi-plugin-mysql', 'database']
};

internals.attachConnection = function (request, reply) {

    return internals.getConnection((err, conn) => {

        Hoek.assert(!err, err);
        request.app.db = conn;

        return reply.continue();
    });
};

internals.getConnection = function (callback) {

    Hoek.assert(internals.pool, 'No mysql pool found');

    return internals.pool.getConnection(callback);
};

internals.tail = function (request) {

    if (request.app.db) {
        request.app.db.release();
    }
};

internals.stop = function () {

    return internals.pool.end(() => {

        internals.pool = null;
    });
};

exports.register = function (server, baseOptions, next) {

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
        server.ext('onPreAuth', internals.attachConnection);

        // end connection after request finishes
        server.on('tail', internals.tail);

        // try to close pool on server end
        server.on('stop', internals.stop);

        // add getDb() function to `server`
        server.decorate('server', 'getDb', internals.getConnection);

        server.log(internals.logTags, 'Connection to the database successfull');

        return next();
    });
};

exports.register.attributes = {
    pkg: require('../package.json'),
    once: true
};
