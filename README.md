amqp-ts (AMQP TypeScript)
=========================

This is a summary. See the [amqp-ts Wiki](https://github.com/abreits/amqp-ts/wiki) for the full documentation of the library.

## Table of Contents

- [Overview](#overview)
- [What's new](#whatsnew)
- [Roadmap](#roadmap)


Overview    <a name="overview"></a>
--------

Amqp-ts is a library for nodejs that simplifies communication with AMQP message busses written in Typescript. It has been tested on RabbitMQ. It uses the [amqplib](http://www.squaremobius.net/amqp.node/) library by [Michael Bridgen (squaremo)](https://github.com/squaremo).

##### Defining Features

- [High level non opinioned library], no need to worry about channels etc.
- ['Lazy' initialization](#initialization), async AMQP dependencies are resolved automatically
- [Automatic reconnection](#reconnect), when the connection with the AMQP server fails, the whole connection and configuration is rebuilt automatically
- Written in typescript, it is compatible with the Typescript 1.6 module type definition resulution for node.js.

##### Current status

This is a work in progress, currently in a late beta state.

It does depend on the following npm libraries:
- [amqplib](http://www.squaremobius.net/amqp.node/)
- [bluebird](https://github.com/petkaantonov/bluebird)
- [winston](https://github.com/winstonjs/winston)

The DefinitelyTyped [tsd](http://definitelytyped.org/tsd) tool is used to manage the typescript type definitions.

### Lazy Initialization    <a name="initialization"></a>

No need to nest functionality, just create a connection, declare your exchanges, queues and
bindings and send and receive messages. The library takes care of any direct dependencies.

If you define an exchange and a queue and bind the queue to the exchange and want to make
sure that the queue is connected to the exchange before you send a message to the exchange you can call the `connection.completeConfiguration()` method and act on the promise it returns.

##### ES6/Typescript Example

    import * as Amqp from "amqp-ts";

    var connection = new Amqp.Connection("amqp://localhost");
    var exchange = connection.declareExchange("ExchangeName");
    var queue = connection.declareQueue("QueueName");
    queue.bind(exchange);
    queue.startConsumer((message) => {
        console.log("Message received: " + message);
    }

    // it is possible that the following message is not received because
    // it can be sent before the queue, binding or consumer exist
    exchange.publish("Test");

    connection.completeConfiguration().then(() => {
        // the following message will be received because
        // everything you defined earlier for this connection now exists
        exchange.publish("Test2");
    });

##### Javascript Example

    var Amqp = require("amqp-ts");

    var connection = new Amqp.Connection("amqp://localhost");
    var exchange = connection.declareExchange("ExchangeName");
    var queue = connection.declareQueue("QueueName");
    queue.bind(exchange);
    queue.startConsumer(function (message) {
        console.log("Message received: " + message);
    }

    // it is possible that the following message is not received because
    // it can be sent before the queue, binding or consumer exist
    exchange.publish("Test");

    connection.completeConfiguration().then(function () {
        // the following message will be received because
        // everything you defined earlier for this connection now exists
        exchange.publish("Test2");
    });


### Automatic Reconnection    <a name="reconnect"></a>

When the library detects that the connection with the AMQP server is lost, it tries to automatically reconnect to the server.


What's new    <a name="whatsnew"></a>
----------
### version 0.10.4
 - added amqp-ts examples for the [RabbitMQ tutorials](https://www.rabbitmq.com/getstarted.html)
 - fixed a bug in the queue.rpc
 - fixed documentation errors

### version 0.10.3
 - Moved the documentation to the wiki,only the 'Overview', 'What's new' and 'Roadmap' stay in the readme.md for npmjs and GitHub.
 - Improved the documentation

### version 0.10.2

 - rearranged this readme
 - added rpc support to the [Queue](#queue_rpc) and [Exchange](#exchange_rpc) for [RabbitMQ 'direct reply-to'](https://www.rabbitmq.com/direct-reply-to.html) RPC functionality
 - updated dependencies
 - updated the documentation


### version 0.10.1

 - added a 'low level' queue [consumer](#queue_startConsumer) that receives the raw message and can 'ack' or 'nack' these messages itself
 - cleanup integration tests
 - readme update and fixes

### version 0.10

 - added close methods to [Exchange](#api) and [Queue](#api)
 - changed Promise type for [Exchange.initialized](#exchange_initialized) and [Queue.initialized](#queue_initialized)
 - minor readme fixes
 - improved robustness for unit tests

### version 0.9.4 & 0.9.5

 - small code cleanup: defined optional parameter default values in typescript
 - fixed a few bugs when publishing a message to an exchange after a disconnect/reconnect

### version 0.9.3

 - Added this section
 - Added the roadmap section
 - Improved the winston logging messages



Roadmap    <a name="roadmap"></a>
-------

The roadmap section describes things that I want to add or change in the (hopefully near) future.

 - Better source code documentation, maybe even use jsdoc or tsdoc to generate the api documentation
 - Improve the logging facilities
 - Add amqp-ts versions of the [RabbitMQ tutorial](https://www.rabbitmq.com/getstarted.html) examples
