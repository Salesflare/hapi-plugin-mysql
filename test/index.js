'use strict';

const Lab = require('lab');
const Code = require('code');
const Hapi = require('hapi');
const Hoek = require('hoek');

const lab = exports.lab = Lab.script();
const describe = lab.experiment;
const it = lab.it;
const expect = Code.expect;


const internals = {
    dbOptions: {
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'test'
    }
};

internals.insertHandler = function (request, reply) {

    const sql = 'INSERT INTO test SET id = null';

    expect(request.app.db, 'db connection').to.exist();

    return request.app.db.query(sql, (err, results) => {

        expect(err, 'error').to.not.exist();
        expect(results.insertId, 'insert Id').to.exist();

        return reply(results.affectedRows);
    });
};

internals.selectHandler = function (request, reply) {

    const sql = 'SELECT * FROM test';

    expect(request.app.db, 'db connection').to.exist();

    return request.app.db.query(sql, (err, results) => {

        expect(err, 'error').to.not.exist();

        return reply(results);
    });
};


describe('Hapi MySQL', () => {

    describe('Basics', () => {

        it('Makes a db connection that works', (done) => {

            const options = Hoek.clone(internals.dbOptions);

            const server = new Hapi.Server();
            server.connection();

            return server.register({
                register: require('../'),
                options
            }, (err) => {

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

                return server.inject({
                    method: 'POST',
                    url: '/test'
                }, (response) => {

                    expect(response.statusCode, 'post status code').to.equal(200);
                    expect(response.result, 'post result').to.be.above(0);

                    return server.inject({
                        method: 'GET',
                        url: '/test'
                    }, (getResponse) => {

                        expect(getResponse.statusCode, 'get status code').to.equal(200);
                        expect(getResponse.result.length, 'get result').to.be.above(0);

                        return server.stop(done);
                    });
                });
            });
        });

        it('Quite fail when connection is deleted', (done) => {

            const options = Hoek.clone(internals.dbOptions);

            const server = new Hapi.Server();
            server.connection();

            return server.register({
                register: require('../'),
                options
            }, (err) => {

                expect(err).to.not.exist();

                server.route([{
                    method: 'GET',
                    path: '/test',
                    config: {
                        handler: (request, reply) => {

                            request.app.db = undefined;
                            return reply('ok');
                        }
                    }
                }]);

                return server.inject({
                    method: 'GET',
                    url: '/test'
                }, (response) => {

                    expect(response.statusCode, 'post status code').to.equal(200);
                    expect(response.result, 'post result').to.equal('ok');

                    return server.stop(done);
                });
            });
        });

        it('Pool is ended on Server.stop()', (done) => {

            const options = Hoek.clone(internals.dbOptions);

            const server = new Hapi.Server();
            server.connection();

            return server.register({
                register: require('../'),
                options
            }, (err) => {

                expect(err).to.not.exist();

                return server.start((err) => {

                    expect(err).to.not.exist();

                    return server.stop(done);
                });
            });
        });
    });

    describe('Init', () => {
    
        it('Registers using `init`', (done) => {
       
            const options = Hoek.clone(internals.dbOptions);

            const MySQLPlugin = require('../');
            return MySQLPlugin.init(options, (err) => {
            
                expect(err).to.not.exist();

                return MySQLPlugin.stop(done);
            });
        });

        it('Registers with calling `init` and then using it as a plugin with no options', (done) => {
       
            const options = Hoek.clone(internals.dbOptions);

            const MySQLPlugin = require('../');
            return MySQLPlugin.init(options, (err) => {
            
                expect(err).to.not.exist();

                const server = new Hapi.Server();
                server.connection();
    
                return server.register({
                    register: MySQLPlugin
                }, (err) => {
    
                    expect(err).to.not.exist();
    
                    return server.stop(done);
                });
            });
        });

        it('Errors on registering twice', (done) => {
       
            const options = Hoek.clone(internals.dbOptions);

            const MySQLPlugin = require('../');
            return MySQLPlugin.init(options, (err) => {
            
                expect(err).to.not.exist();

                return MySQLPlugin.init(options, (err) => {

                    expect(err).to.be.an.error('There is already a pool configured');

                    return MySQLPlugin.stop(done);
                });
            });
        });
        
        it('Errors on registering with no host option', (done) => {

            const MySQLPlugin = require('../');
            return MySQLPlugin.init({}, (err) => {
            
                expect(err).to.be.an.error('Options must include host property');

                return done();
            });
        });

        it('Errors when options are wrong', (done) => {

            const options = Hoek.clone(internals.dbOptions);
            options.host = 'test';

            const MySQLPlugin = require('../');
            return MySQLPlugin.init(options, (err) => {
            
                expect(err).to.be.an.error();

                return MySQLPlugin.stop(done);
            });
        });

        // This test is mostly to hit the fallback part when no callback is provided to `stop`
        // If you know how to let `pool.end` actually error, please do PR ^^
        it('Errors throws when calling stop with no callback', (done) => {

            const options = Hoek.clone(internals.dbOptions);
            options.host = 'test';

            const MySQLPlugin = require('../');
            return MySQLPlugin.init(options, (err) => {
            
                expect(err).to.be.an.error();

                MySQLPlugin.stop();
                return done();
            });
        });
    });

    describe('Extras', () => {

        it('Exposes getDb on the server', (done) => {

            const options = Hoek.clone(internals.dbOptions);

            const server = new Hapi.Server();
            server.connection();

            return server.register({
                register: require('../'),
                options
            }, (err) => {

                expect(err).to.not.exist();
                expect(server.getDb, 'getDb').to.exist();

                return server.getDb((err, db) => {

                    expect(err).to.not.exist();
                    expect(db, 'db').to.exist();

                    return server.stop(done);
                });
            });
        });

        it('Exposes `getConnection` on the module', (done) => {

            const MySQLPlugin = require('../');
            expect(MySQLPlugin.getConnection).to.be.a.function();

            return done();
        });

        it('Only registers once', (done) => {

            const options = Hoek.clone(internals.dbOptions);

            const server = new Hapi.Server();
            server.connection();

            return server.register([
                {
                    register: require('../'),
                    options
                }, {
                    register: require('../'),
                    options
                }
            ], (err) => {

                expect(err).to.not.exist();

                return server.start((err) => {

                    expect(err).to.not.exist();
                    expect(server.registrations['hapi-plugin-mysql']).to.be.an.object();

                    return server.stop(done);
                });
            });
        });

        it('Works on connectionless servers', (done) => {

            const options = Hoek.clone(internals.dbOptions);

            const server = new Hapi.Server();

            return server.register([
                {
                    register: require('../'),
                    options
                }, {
                    register: require('../'),
                    options
                }
            ], (err) => {

                expect(err).to.not.exist();

                return server.initialize((err) => {

                    expect(err).to.not.exist();
                    expect(server._registrations['hapi-plugin-mysql']).to.be.an.object();

                    return server.stop(done);
                });
            });
        });
    });
});
