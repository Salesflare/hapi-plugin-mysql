'use strict';

var MySQL = require('mysql');
var Hoek = require('hoek');

var pool = null;
var useTransactions = false;

var _rollback = function (server, connection, callback) {
	connection.rollback(function () {
		if (process.env.NODE_ENV !== 'prod' || process.argv[2] !== 'prod') server.log(['hapi-plugin-mysql', 'database'], 'Rolling back transaction');

		connection.release();
		callback();
	});
};

var _endConnection = function (server, connection, callback) {
	connection.commit(function (err) {
		if (err) {
			_rollback(server, connection, callback);
		} else {
			connection.release();

			return callback();
		}
	});
};

exports.register = function (server, options, next) {
	Hoek.assert(options.hasOwnProperty('host'), 'Options must include host property');

	useTransactions = Hoek.clone(options.useTransactions);
	delete options.useTransactions;

	pool = MySQL.createPool(options);

	// test connection
	pool.getConnection(function (err, connection) {
		Hoek.assert(!err || connection, 'Connection to the database failed');

		// release test connection
		connection.release();

		server.log(['hapi-plugin-mysql', 'database'], 'Connection to the database succesfull');

		// add data to request object
		server.ext('onPreHandler', function (request, reply) {
			Hoek.assert(pool, 'No mysql pool found');

			pool.getConnection(function (err, connection) {
				if (err) return reply(err);

				if (useTransactions) {
					connection.beginTransaction(function (err) {
						if (err) _endConnection(server, connection, reply(err));

						request.connection = connection;
						reply.continue();
					});
				} else {
					request.connection = connection;
					reply.continue();
				}
			});
		});

		// end connection after handler finishes
		server.ext('onPostHandler', function (request, reply) {
			_endConnection(server, request.connection, reply.continue());
		});

		// close pool on server end
		server.on('stop', function (server) {
			pool.end(function (err) {
				if (err) server.log(['hapi-plugin-mysql', 'database'], 'Failed to gracefully end the pool');
				pool = null;		
			});
		});
	});
	next();
};

exports.register.attributes = {
	pkg: require('../package.json')
};