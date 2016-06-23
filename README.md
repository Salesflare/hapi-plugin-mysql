# hapi-plugin-mysql [![Build Status](https://travis-ci.org/Salesflare/hapi-plugin-mysql.svg?branch=master)](https://travis-ci.org/Salesflare/hapi-plugin-mysql)
> Hapi plugin for MySQL


## What
Attaches a MySQL connection from a pool to every request.

## How
Via `request.app.db`. You can also manualy get a connection from the server via `server.getDb(function (err, connection) {})`.

```javascript
server.register({
	register: require('hapi-plugin-mysql'),
	options: {
		host: "localhost",
		user: "root",
		password: ""
	}
}, function (err) {
	if (err) console.log(err);
	...
});

server.route({ 
	method: 'GET', 
	path: '/', 
	handler: function (request, reply) { 
			request.app.db.query(...);
			return reply('ok'); 
		} 
	});
```

The options are the same options you can pass onto the `mysql` lib for making a connection. See https://www.npmjs.com/package/mysql for more info on the `mysql` lib itself.

The keyword `db` is used because `connection` is used by `Hapi` and might cause confusion/collison.

## Catches

- The releasing of the connection is handled on the `tail` event of the server. If you have handlers that reply early, with `reply.file()` for example, be sure to register a `tail` event and use that as callback.
- Transactions are no longer a part of this plugin and should be handled (with care) in your code

## Testing
* 100% code coverage!
* The tests requires you to have a `test` db with a table  `test` and `{user: root, password: ""}`. 
* See `.travis.yml` and the tests for more info.

## Changelog 
See the [releases](https://github.com/Salesflare/hapi-plugin-mysql/releases) page
