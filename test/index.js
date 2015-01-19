'use strict';

var Lab = require('lab');
var Code = require('code');
var Hapi = require('hapi');

var lab = exports.lab = Lab.script();
var it = lab.it;
var expect = Code.expect;

var dbOptions = {
	host: 'localhost',
	user: 'root',
	password: '',
	database: 'test'
};

lab.experiment('Integration', function () {
	it ('Makes a db connection that works', function (done) {
		var server = new Hapi.Server();
		server.connection();
		
		server.register({
			register: require('../'),
			options: dbOptions
		}, function (err) {
			expect(err).to.not.exist();
			
			server.route({
				method: 'GET',
				path: '/test',
				config: {
					handler: function (request, reply) {
						var sql = 'INSERT INTO test SET id = 1';

						expect(request.app.db, 'db connection').to.exist();

						request.app.db.query(sql, function (err, results) {
							expect(err, 'error').to.not.exist();
							expect(results.insertId, 'insert Id').to.exist();

							return reply({id: results.insertId});
						});
					}
				}
			});

			server.inject({
				method: 'GET',
				url: '/test'
			}, function (response) {
				expect(response.statusCode, 'status code').to.equal(200);
				expect(response.result, 'result').to.deep.equal({
					id: 1
				});

				done();
			});
		});
	});
});