//var amqp = require('amqp-ts'); // normal use
var amqp = require('../../lib/amqp-ts'); // for use inside this package

// create a new connection (async)
var connection = new amqp.Connection();

// declare a new exchange, it will be created if it does not already exist (async)
var exchange = connection.declareExchange('logs', 'fanout', {durable: false});

// get the message from the command line
var message = new amqp.Message(process.argv.slice(2).join(' ') || 'Hello World!');

// send a message, it will automatically be sent after the connection and the queue declaration
// have finished successfully
exchange.send(message);

// not exactly true, but the message will be sent shortly
console.log(' [x] Sent \'' + message.getContent() + '\'');

// after half a second close the connection
setTimeout(function() {
  connection.close();
}, 500);
