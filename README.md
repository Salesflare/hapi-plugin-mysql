# hapi-plugin-mysql
Hapi plugin for MySQL

## What
Attaches a connection to every request. 
Can also automaticly start a transaction.

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
			request.connection.query(...);
			return reply('ok'); 
		} 
	});
```

The options are the same options you can pass onto `mysql` lib for making a conection. See https://www.npmjs.com/package/mysql for more info on the `mysql` lib itself.