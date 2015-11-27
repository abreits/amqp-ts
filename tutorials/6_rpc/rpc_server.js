//var amqp = require('amqp-ts'); // normal use
var amqp = require('../../lib/amqp-ts'); // for use inside this package

// create a new connection (async)
var connection = new amqp.Connection();

// declare a the rpc queue, it will be created if it does not already exist (async)
var queue = connection.declareQueue('rpc_queue', {durable: false});

// create an rpc consumer function for the queue, automatically returns the return value of the
// consumer function to the replyTo queue, if it exists
// this will keep running until the program is halted or is stopped with queue.stopConsumer()
queue.activateConsumer(function(message) {
  var n = parseInt(message.getContent());
  console.log(' [.] fib(' + n + ')');

  // return fibonacci number
  return fibonacci(n);
}, {noAck: true});

// compute the fibonacci number
function fibonacci(n) {
  if (n == 0 || n == 1)
    return n;
  else
    return fibonacci(n - 1) + fibonacci(n - 2);
}
