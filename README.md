# hapi-plugin-mysql [![Build Status](https://travis-ci.org/Salesflare/hapi-plugin-mysql.svg?branch=master)](https://travis-ci.org/Salesflare/hapi-plugin-mysql)
> Hapi plugin for MySQL


## What
Attaches a MySQL connection from a pool to every request. 

## How
```javascript
server.register({
	register: require('hapi-plugin-mysql');
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

The connection is available through `request.app.db` because `request.connection` is a reserved keyword by `Hapi`.

!!!!

- The releasing of the connection is handled on the `tail` event of the server. If you have handlers that reply early, with `reply.file()` for example, be sure to register a `tail` event and use that as callback.
- Beware when setting `useTransactions`. This will start a transaction on every request and if not managed right may lead to table/dead/row locks. It is better to not enable it and on the routes you want transactions on do the handling yourself.

!!!!

## Testing
The tests requires you to have a `test` db with a table  `test` and `{user: root password: ""}`. See `.travis.yml` and the tests for more info.
