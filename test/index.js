var Lab = require('lab');
var Code = require('code');
var Hapi = require('hapi');
var Hoek = require('hoek');

var lab = exports.lab = Lab.script();
var describe = lab.experiment;
var it = lab.it;
var expect = Code.expect;


var internals = {};
internals.dbOptions = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'test'
};

internals.insertHandler = function (request, reply) {

    var sql = 'INSERT INTO test SET id = null';

    expect(request.app.db, 'db connection').to.exist();

    request.app.db.query(sql, function (err, results) {

        expect(err, 'error').to.not.exist();
        expect(results.insertId, 'insert Id').to.exist();

        return reply(results.affectedRows);
    });
};

internals.selectHandler = function (request, reply) {

    var sql = 'SELECT * FROM test';

    expect(request.app.db, 'db connection').to.exist();

    request.app.db.query(sql, function (err, results) {

        expect(err, 'error').to.not.exist();

        return reply(results);
    });
};


describe('Hapi MySQL', function () {

    describe('Basics', function () {

        it('Makes a db connection that works', function (done) {

            var options = Hoek.clone(internals.dbOptions);

            var server = new Hapi.Server();
            server.connection();

            server.register({
                register: require('../'),
                options: options
            }, function (err) {

                expect(err).to.not.exist();

                server.route([{
                    method: 'POST',
                    path: '/test',
                    config: {
                        handler: internals.insertHandler
                    }
                }, {
                    method: 'GET',
                    path: '/test',
                    config: {
                        handler: internals.selectHandler
                    }
                }]);

                server.inject({
                    method: 'POST',
                    url: '/test'
                }, function (response) {

                    expect(response.statusCode, 'post status code').to.equal(200);
                    expect(response.result, 'post result').to.be.above(0);

                    server.inject({
                        method: 'GET',
                        url: '/test'
                    }, function (response) {

                        expect(response.statusCode, 'get status code').to.equal(200);
                        expect(response.result.length, 'get result').to.be.above(0);

                        server.stop(done);
                    });
                });
            });
        });

        it('Quite fail when connection is deleted', function (done) {

            var options = Hoek.clone(internals.dbOptions);

            var server = new Hapi.Server();
            server.connection();

            server.register({
                register: require('../'),
                options: options
            }, function (err) {

                expect(err).to.not.exist();

                server.route([{
                    method: 'GET',
                    path: '/test',
                    config: {
                        handler: function (request, reply) {

                            request.app.db = undefined;
                            return reply('ok');
                        }
                    }
                }]);

                server.inject({
                    method: 'GET',
                    url: '/test'
                }, function (response) {

                    expect(response.statusCode, 'post status code').to.equal(200);
                    expect(response.result, 'post result').to.equal('ok');

                    server.stop(done);
                });
            });
        });

        it('Pool is set to null on Server.stop()', function (done) {

            var options = Hoek.clone(internals.dbOptions);

            var server = new Hapi.Server();
            server.connection();

            server.register({
                register: require('../'),
                options: options
            }, function (err) {

                expect(err).to.not.exist();

                server.start(function (err) {

                    expect(err).to.not.exist();

                    server.stop(function () {

                        setImmediate(done);
                    });
                });
            });
        });
    });

    describe('Extras', function () {

        it('Exposes getDb on the server', function (done) {

            var options = Hoek.clone(internals.dbOptions);

            var server = new Hapi.Server();
            server.connection();

            server.register({
                register: require('../'),
                options: options
            }, function (err) {

                expect(err).to.not.exist();
                expect(server.getDb, 'getDb').to.exist();

                server.getDb(function (err, db) {

                    expect(err).to.not.exist();
                    expect(db, 'db').to.exist();

                    server.stop(done);
                });
            });
        });
    });
});
