# hapi-plugin-mysql [![Build Status](https://travis-ci.org/Salesflare/hapi-plugin-mysql.svg?branch=master)](https://travis-ci.org/Salesflare/hapi-plugin-mysql)
Hapi plugin for MySQL

## What
Attaches a connection to every request. 
Can also automaticly start a transaction. With the `useTransactions` property.

## How
```javascript
server.register({
	register: require('hapi-plugin-mysql');
	options: {
		host: "localhost",
		user: "root",
		password: ""
		useTransactions: true
	}
}, function (err) {
	if (err) console.log(err);
});

server.route({ 
	method: 'GET', 
	path: '/', 
	handler: function (request, reply) { 
			request.db.query(...);
			return reply('ok'); 
		} 
	});
```

The options are the same options you can pass onto `mysql` lib for making a conection. See https://www.npmjs.com/package/mysql for more info on the `mysql` lib itself.

The connection is available through `request.db` because `request.connection` is a reserved keyword by `Hapi`

## Testing
The tests requires you to have a `test` db with `user: root` and `password: ""`. See `.travis.yml` and the test folder for more info.
