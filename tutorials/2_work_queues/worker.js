//var amqp = require('amqp-ts'); // normal use
var amqp = require('../../lib/amqp-ts'); // for use inside this package

// create a new connection (async)
var connection = new amqp.Connection();

// declare a new queue, it will be created if it does not already exist (async)
var queue = connection.declareQueue('task_queue', {durable: true});

// create a consumer function for the queue
// we need a raw message consumer to fake workload with a timeout
// this will keep running until the program is halted or is stopped with queue.stopConsumer()
queue.startConsumer(function(rawMessage, channel) {
  // fake a second of work for every dot in the message
  var message = rawMessage.content.toString();
  var seconds = message.split('.').length - 1;
  console.log(' [x] received message: ' + message);
  setTimeout(function() {
    console.log(" [x] Done");
    channel.ack(rawMessage); // acknowledge that the message has been received (and processed)
  }, seconds * 1000);
}, {rawMessage: true, noAck: false});
