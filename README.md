# hapi-plugin-mysql [![Build Status](https://travis-ci.org/Salesflare/hapi-plugin-mysql.svg?branch=master)](https://travis-ci.org/Salesflare/hapi-plugin-mysql)

> hapi plugin for MySQL

## What

Attaches a MySQL connection from a pool to every request.

## How

Via `request.app.db`.
You can also manually get a connection from the server via `server.getDb(function (err, connection) {})`.

```javascript
await server.register({
    plugin: require('hapi-plugin-mysql'),
    options: {
        host: "localhost",
        user: "root",
        password: ""
    }
});

server.route({
    method: 'GET',
    path: '/',
    handler: async (request, h) => {

        request.app.db.query(...);
        return 'ok';
    }
});
```

The options are the same options you can pass onto the `mysql` lib for making a connection. See <https://www.npmjs.com/package/mysql> for more info on the `mysql` lib itself.

The keyword `db` is used because `connection` was used by `<= hapi@16` and could have caused confusion/collision.

If you want more manual control or you want to use the same pool outside of the hapi part of your server
you can initialize the pool before the plugin registration by calling `await HapiPluginMysql.init(options)` and then call `require('hapi-plugin-mysql').getConnection` to get a connection from the pool.
If you still want to register the plugin (to get all the goodies) just don't pass any options to the plugin registration
and it will use the same pool as first created.
To manually stop the pool call `await HapiPluginMySQL.stop()`.
See the tests for more granular use cases.

## Catches

- Transactions are no longer a part of this plugin and should be handled (with care) in your code

## Testing

- almost 100% code coverage! If you know how to test these last case please do let me know or PR :O
- The tests requires you to have a `test` db with a table  `test` and `{user: root, password: ""}`.
- See `.travis.yml` and the tests for more info.

## Changelog

See the [releases](https://github.com/Salesflare/hapi-plugin-mysql/releases) page
