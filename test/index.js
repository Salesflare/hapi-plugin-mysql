'use strict';

const Lab = require('@hapi/lab'); // eslint-disable-line node/no-unpublished-require
const Code = require('@hapi/code'); // eslint-disable-line node/no-unpublished-require
const Hapi = require('@hapi/hapi');
const Hoek = require('@hapi/hoek');

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

internals.insertHandler = (request) => {

    const sql = 'INSERT INTO test SET id = null';

    expect(request.app.db, 'db connection').to.exist();

    return new Promise((resolve) => {

        return request.app.db.query(sql, (err, results) => {

            expect(err, 'error').to.not.exist();
            expect(results.insertId, 'insert Id').to.exist();

            return resolve(results.affectedRows);
        });
    });
};

internals.selectHandler = (request) => {

    const sql = 'SELECT * FROM test';

    expect(request.app.db, 'db connection').to.exist();

    return new Promise((resolve) => {

        return request.app.db.query(sql, (err, results) => {

            expect(err, 'error').to.not.exist();

            return resolve(results);
        });
    });
};

describe('Hapi MySQL', () => {

    describe('Basics', () => {

        it('Makes a db connection that works', async () => {

            const options = Hoek.clone(internals.dbOptions);

            const server = Hapi.Server();

            await server.register({
                plugin: require('..'),
                options
            });

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

            const response = await server.inject({
                method: 'POST',
                url: '/test'
            });

            expect(response.statusCode, 'post status code').to.equal(200);
            expect(response.result, 'post result').to.be.above(0);

            const getResponse = await server.inject({
                method: 'GET',
                url: '/test'
            });

            expect(getResponse.statusCode, 'get status code').to.equal(200);
            expect(getResponse.result.length, 'get result').to.be.above(0);

            return server.stop();
        });

        it('Makes a promisified db connection that works', async () => {

            const options = Hoek.clone(internals.dbOptions);

            const server = Hapi.Server();

            await server.register({
                plugin: require('..'),
                options
            });

            server.route([{
                method: 'GET',
                path: '/test',
                config: {
                    handler: (request) => {

                        return request.app.connection.query('SELECT * FROM test');
                    }
                }
            }]);

            const getResponse = await server.inject({
                method: 'GET',
                url: '/test'
            });

            expect(getResponse.statusCode, 'get status code').to.equal(200);
            expect(getResponse.result.length, 'get result').to.be.above(0);

            return server.stop();
        });

        it('Returns a promisified connection on server.getConnection', async () => {

            const options = Hoek.clone(internals.dbOptions);

            const server = Hapi.Server();

            await server.register({
                plugin: require('..'),
                options
            });

            server.route([{
                method: 'GET',
                path: '/test',
                config: {
                    handler: async (request) => {

                        const connection = await request.server.getConnection();
                        return connection.query('SELECT * FROM test');
                    }
                }
            }]);

            const getResponse = await server.inject({
                method: 'GET',
                url: '/test'
            });

            expect(getResponse.statusCode, 'get status code').to.equal(200);
            expect(getResponse.result.length, 'get result').to.be.above(0);

            return server.stop();
        });

        it('Quite fail when connection is deleted', async () => {

            const options = Hoek.clone(internals.dbOptions);

            const server = Hapi.Server();

            await server.register({
                plugin: require('..'),
                options
            });

            server.route([{
                method: 'GET',
                path: '/test',
                config: {
                    handler: (request) => {

                        request.app.db = undefined;
                        return 'ok';
                    }
                }
            }]);

            const response = await server.inject({
                method: 'GET',
                url: '/test'
            });

            expect(response.statusCode, 'post status code').to.equal(200);
            expect(response.result, 'post result').to.equal('ok');

            return server.stop();
        });

        it('Pool is ended on Server.stop()', async () => {

            const options = Hoek.clone(internals.dbOptions);

            const server = Hapi.Server();

            await server.register({
                plugin: require('..'),
                options
            });

            await server.start();

            return server.stop();
        });
    });

    describe('Init', () => {

        it('Registers using `init`', async () => {

            const options = Hoek.clone(internals.dbOptions);

            const MySQLPlugin = require('..');

            await MySQLPlugin.init(options);
            return MySQLPlugin.stop();
        });

        it('Registers with calling `init` and then using it as a plugin with no options', async () => {

            const options = Hoek.clone(internals.dbOptions);

            const MySQLPlugin = require('..');

            await MySQLPlugin.init(options);

            const server = Hapi.Server();

            await server.register({
                plugin: MySQLPlugin
            });

            return server.stop();
        });

        it('Errors on registering twice', async () => {

            const options = Hoek.clone(internals.dbOptions);

            const MySQLPlugin = require('..');

            await MySQLPlugin.init(options);

            let threw = false;

            try {
                await MySQLPlugin.init(options);
            }
            catch (err) {
                expect(err).to.be.an.error('There is already a pool configured');
                threw = true;
            }

            expect(threw).to.be.true();

            return MySQLPlugin.stop();
        });

        it('Errors on registering with no options', async () => {

            const MySQLPlugin = require('..');

            let threw = false;

            try {
                await MySQLPlugin.init({});
            }
            catch (err) {
                expect(err).to.be.an.error('No pool and no options to create one found, call `init` or `register` with options first');
                threw = true;
            }

            expect(threw).to.be.true();
        });

        it('Errors on registering with no host options', async () => {

            const options = Hoek.clone(internals.dbOptions);
            delete options.host;

            const MySQLPlugin = require('..');

            let threw = false;

            try {
                await MySQLPlugin.init(options);
            }
            catch (err) {
                expect(err).to.be.an.error('Options must include host property');
                threw = true;
            }

            expect(threw).to.be.true();
        });

        it('Errors when options are wrong', async () => {

            const options = Hoek.clone(internals.dbOptions);
            options.host = 'test';

            const MySQLPlugin = require('..');

            let threw = false;

            try {
                await MySQLPlugin.init(options);
            }
            catch (err) {
                expect(err).to.be.an.error();
                threw = true;
            }

            expect(threw).to.be.true();
        });
    });

    describe('Extras', () => {

        it('Exposes getDb on the server', async () => {

            const options = Hoek.clone(internals.dbOptions);

            const server = Hapi.Server();

            await server.register({
                plugin: require('..'),
                options
            });

            expect(server.getDb, 'getDb').to.exist();

            await new Promise((resolve) => {

                return server.getDb((err, db) => {

                    expect(err).to.not.exist();
                    expect(db, 'db').to.exist();

                    return resolve();
                });
            });

            return server.stop();
        });

        it('Exposes getConnection on the server', async () => {

            const options = Hoek.clone(internals.dbOptions);

            const server = Hapi.Server();

            await server.register({
                plugin: require('..'),
                options
            });

            expect(server.getConnection, 'getConnection').to.exist();

            const connection = await server.getConnection();

            expect(connection, 'connection').to.exist();

            return server.stop();
        });

        it('Exposes `getConnection` on the module', async () => {

            const MySQLPlugin = require('..');

            await MySQLPlugin.init(internals.dbOptions);
            expect(MySQLPlugin.getConnection).to.be.a.function();
            expect(await MySQLPlugin.getConnection()).to.exist();

            return MySQLPlugin.stop();
        });

        it('Exposes `getConnection` on the module with a callback', async () => {

            const MySQLPlugin = require('..');

            await MySQLPlugin.init(internals.dbOptions);
            expect(MySQLPlugin.getConnection).to.be.a.function();

            // By stopping we test both that getConnection takes a callback and that it returns errors properly
            await MySQLPlugin.stop();
            return new Promise((resolve) => {

                return MySQLPlugin.getConnection((err) => {

                    expect(err).to.exist();
                    return resolve();
                });
            });
        });

        it('Promisified commit/rollback/beginTransaction', async () => {

            const MySQLPlugin = require('..');

            await MySQLPlugin.init(internals.dbOptions);
            expect(MySQLPlugin.getConnection).to.be.a.function();
            const connection = await MySQLPlugin.getConnection();

            await connection.beginTransaction();
            await connection.commit();
            await connection.rollback();

            return MySQLPlugin.stop();
        });
    });
});
