//var amqp = require('amqp-ts'); // normal use
var amqp = require('../../lib/amqp-ts'); // for use inside this package

var args = process.argv.slice(2);

var severity = args[0];
if (!severity) {
  console.log('Usage: receive_logs_topic.js <facility>.<severity>');
  process.exit(1);
}

// create a new connection (async)
var connection = new amqp.Connection();

// declare a new exchange, it will be created if it does not already exist (async)
var exchange = connection.declareExchange('topic_logs', 'topic', {durable: false});

// declare a new queue, it will be created if it does not already exist (async)
var queue = connection.declareQueue('', {exclusive: true});

// connect the queue to the exchange for each key pattern
args.forEach(function(key) {
  queue.bind(exchange, key);
});

// create a consumer function for the queue
// this will keep running until the program is halted or is stopped with queue.stopConsumer()
queue.activateConsumer(function(message) {
  var content = message.content.toString();
  var routingKey = message.fields.routingKey;
  console.log(' [x] ' + routingKey + ' : \'' + content + '\'');
}, {rawMessage: true, noAck: true});
