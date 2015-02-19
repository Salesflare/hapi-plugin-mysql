'use strict';

var MySQL = require('mysql');
var Hoek = require('hoek');

var internals = {
	useTransactions: false,
	pool: null,
	logTags: ['hapi-plugin-mysql', 'database']
};

internals.rollback = function (request, connection, callback) {

	connection.rollback(function () {

		if (process.env.NODE_ENV !== 'prod' || process.argv[2] !== 'prod'){
			request.log(internals.logTags, 'Rolling back transaction');
		}

		connection.release();

		return callback();
	});
};

internals.endConnection = function (request, connection, callback) {

	if (internals.useTransactions) {
		connection.commit(function (err) {

			if (err) {
				return internals.rollback(request, connection, callback);
			}

			connection.release();

			return callback();
		});
	} else {
		connection.release();

		return callback();
	}
};

internals.tail = function (request) {

	if (request.app.db) {
		return internals.endConnection(request, request.app.db, Hoek.ignore);
	}

	return Hoek.ignore;
};

internals.addConnection = function (request, reply) {

	Hoek.assert(internals.pool, 'No mysql pool found');

	internals.pool.getConnection(function (err, connection) {
		if (err) {
			return reply(err);
		}

		if (internals.useTransactions) {
			connection.beginTransaction(function (err) {

				if (err) {
					return internals.endConnection(request, connection, function () {
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
};

internals.stop = function () {

	if (internals.pool) {
		internals.pool.end(function () {
			internals.pool = null;
		});
	}
};

exports.register = function (server, baseOptions, next) {

	Hoek.assert(baseOptions.hasOwnProperty('host'), 'Options must include host property');

	var options = Hoek.clone(baseOptions);

	internals.useTransactions = Hoek.clone(options.useTransactions) || false;
	delete options.useTransactions;

	internals.pool = MySQL.createPool(options);

	// test connection
	internals.pool.getConnection(function (err, connection) {

		Hoek.assert(!err, err);
		Hoek.assert(connection, 'Got no connection from pool');

		// release test connection
		connection.release();

		server.log(internals.logTags, 'Connection to the database successfull');

		// add data to request object
		server.ext('onPreAuth', internals.addConnection);

		// end connection after request finishes
		server.on('tail', internals.tail);

		// close pool on server end
		server.on('stop', internals.stop);

		return next();
	});
};

exports.register.attributes = {
	pkg: require('../package.json')
};
