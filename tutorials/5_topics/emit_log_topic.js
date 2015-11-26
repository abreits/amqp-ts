//var amqp = require('amqp-ts'); // normal use
var amqp = require('../../lib/amqp-ts'); // for use inside this package

// create a new connection (async)
var connection = new amqp.Connection();

// declare a new exchange, it will be created if it does not already exist (async)
var exchange = connection.declareExchange('topic_logs', 'topic', {durable: false});

// get the topic key and message from the command line
var args = process.argv.slice(2);
var message = new amqp.Message(args.slice(1).join(' ') || 'Hello World!');
var key = (args.length > 0) ? args[0] : 'anonymous.info';

// send a message, it will automatically be sent after the connection and the queue declaration
// have finished successfully
exchange.send(message, key);

// not exactly true, but the message will be sent shortly
console.log(' [x] Sent ' + key + ': \'' + message.getContent() + '\'');

// after half a second close the connection
setTimeout(function() {
  connection.close();
}, 500);
