var MySQL = require('mysql');
var Hoek = require('hoek');

var internals = {
    pool: null,
    logTags: ['hapi-plugin-mysql', 'database']
};

internals.tail = function (request) {

    if (request.app.db) {
        request.app.db.release();
    }
};

internals.getConnection = function (callback) {

    Hoek.assert(internals.pool, 'No mysql pool found');

    return internals.pool.getConnection(callback);
};

internals.stop = function () {

    return internals.pool.end(function () {

        internals.pool = null;
    });
};

exports.register = function (server, baseOptions, next) {

    Hoek.assert(baseOptions.hasOwnProperty('host'), 'Options must include host property');

    var options = Hoek.clone(baseOptions);

    internals.pool = MySQL.createPool(options);

    // test connection
    return internals.pool.getConnection(function (err, connection) {

        Hoek.assert(!err, err);
        Hoek.assert(connection, 'Got no connection from pool');

        // release test connection
        connection.release();

        // add data to request object
        server.ext('onPreAuth', function (request, reply) {

            return internals.getConnection(function (err, conn) {

                Hoek.assert(!err, err);
                request.app.db = conn;

                return reply.continue();
            });
        });

        // end connection after request finishes
        server.on('tail', internals.tail);

        // try to close pool on server end, this might not decently work since Hapi doesn't wait for the listeners to finish
        server.on('stop', internals.stop);

        // add function to get a connection in plugins for example
        server.decorate('server', 'getDb', internals.getConnection);

        server.log(internals.logTags, 'Connection to the database succesfull');

        return next();
    });
};

exports.register.attributes = {
    pkg: require('../package.json')
};
