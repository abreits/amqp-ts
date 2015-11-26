//var amqp = require('amqp-ts'); // normal use
var amqp = require('../../lib/amqp-ts'); // for use inside this package

// create a new connection (async)
var connection = new amqp.Connection();

// declare a new queue, it will be created if it does not already exist (async)
var queue = connection.declareQueue('hello', {durable: false});

// send a message, it will automatically be sent after the connection and the queue declaration
// have finished successfully
var message = new amqp.Message('Hello World!')
queue.send(message);

// not exactly true, but the message will be sent shortly
console.log(' [x] Sent \'Hello World!\'');

// after half a second close the connection
setTimeout(function() {
  connection.close();
}, 500);