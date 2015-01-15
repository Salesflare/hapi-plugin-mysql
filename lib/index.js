'use strict';

var MySQL = require('mysql');
var Hoek = require('hoek');

var pool = null;
var useTransactions = false;

var _rollback = function (server, connection, callback) {
	connection.rollback(function () {
		if (process.env.NODE_ENV !== 'prod' || process.argv[2] !== 'prod') server.log(['hapi-plugin-mysql', 'database'], 'Rolling back transaction');

		connection.release();
		return callback();
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

exports.register = function (server, base_options, next) {
	Hoek.assert(base_options.hasOwnProperty('host'), 'Options must include host property');

	var options = Hoek.clone(base_options);

	useTransactions = Hoek.clone(options.useTransactions);
	delete options.useTransactions;

	pool = MySQL.createPool(options);

	// test connection
	pool.getConnection(function (err, connection) {
		Hoek.assert(!err, err);
		Hoek.assert(connection, 'Got no connection from pool');

		connection.ping(function (err) {
			Hoek.assert(!err, err);

			// release test connection
			connection.release();

			server.log(['hapi-plugin-mysql', 'database'], 'Connection to the database succesfull');

			// end connection after handler finishes
			server.ext('onPostHandler', function (request, reply) {
				_endConnection(server, request.db, function () {
					return reply.continue();
				});
			});

			// add data to request object
			server.ext('onPreHandler', function (request, reply) {
				Hoek.assert(pool, 'No mysql pool found');

				pool.getConnection(function (err, connection) {
					if (err) return reply(err);

					if (useTransactions) {
						connection.beginTransaction(function (err) {
							if (err) _endConnection(server, connection, function () {
								return reply(err);
							});

							request.db = connection;
							return reply.continue();
						});
					} else {
						request.db = connection;
						return reply.continue();
					}
				});
			});

			// close pool on server end
			server.on('stop', function (server) {
				pool.end(function (err) {
					if (err) server.log(['hapi-plugin-mysql', 'database'], 'Failed to gracefully end the pool');
					pool = null;		
				});
			});
			return next();
		});
	});
};

exports.register.attributes = {
	pkg: require('../package.json')
};