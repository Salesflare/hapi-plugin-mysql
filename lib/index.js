'use strict';

var MySQL = require('mysql');
var Hoek = require('hoek');

var logTags = ['hapi-plugin-mysql', 'database'];
var useTransactions = false;
var pool = null;

var _rollback = function (server, connection, callback) {
	connection.rollback(function () {
		if (process.env.NODE_ENV !== 'prod' || process.argv[2] !== 'prod') server.log(logTags, 'Rolling back transaction');

		connection.release();	
		return callback();
	});
};

var _endConnection = function (server, connection, callback) {
	if (useTransactions) {
		connection.commit(function (err) {
			if (err) {
				return _rollback(server, connection, callback);
			}

			connection.release();
			return callback();
		});
	} else {
		connection.end(function (err) {
			if (err) server.log(logTags, 'Ending connection failed');
			return callback();
		});
	}
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

		// release test connection
		connection.release();

		server.log(logTags, 'Connection to the database succesfull');

		// add data to request object
		server.ext('onPreAuth', function (request, reply) {
			Hoek.assert(pool, 'No mysql pool found');

			pool.getConnection(function (err, connection) {
				if (err) return reply(err);

				if (useTransactions) {
					connection.beginTransaction(function (err) {
						if (err) {
							return _endConnection(server, connection, function () {
								return reply(err);
							});
						}

						request.app.db = connection;
						return reply.continue();
					});
				} else {
					request.app.db = connection;
					return reply.continue();
				}
			});
		});

		// end connection after request finishes
		server.on('tail', function (request) {
			_endConnection(server, request.app.db, Hoek.ignore);
		});

		// close pool on server end
		server.on('stop', function (server) {
			pool.end(function (err) {
				if (err) server.log(logTags, 'Failed to gracefully end the pool');
				pool = null;		
			});
		});
		
		return next();
	});
};

exports.register.attributes = {
	pkg: require('../package.json')
};