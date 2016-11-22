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

### Important Changes

Starting in version 0.14 the return type of [exchange.rpc](https://github.com/abreits/amqp-ts/wiki/Exchange%20class#rpc) and [queue.rpc](https://github.com/abreits/amqp-ts/wiki/Queue%20class#rpc) changed from 'Promise < any >' to 'Promise < [Message](https://github.com/abreits/amqp-ts/wiki/Message%20class) >'.

Starting in version 0.12 the [Message class](https://github.com/abreits/amqp-ts/wiki/Message%20class) has been added. It is a more elegant way to send and receive messages.
It is the preferred way to deal with sending and receiving messages.


### Defining Features

- [High level non opinioned library], no need to worry about channels etc.
- ['Lazy' initialization](#initialization), async AMQP dependencies are resolved automatically
- [Automatic reconnection](#reconnect), when the connection with the AMQP server fails, the whole connection and configuration is rebuilt automatically
- Written in typescript, it is compatible with the Typescript 1.6 module type definition resolution for node.js.

### Current status

The library is considered production ready.

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
```TypeScript
import * as Amqp from "amqp-ts";

var connection = new Amqp.Connection("amqp://localhost");
var exchange = connection.declareExchange("ExchangeName");
var queue = connection.declareQueue("QueueName");
queue.bind(exchange);
queue.activateConsumer((message) => {
    console.log("Message received: " + message.getContent());
});

// it is possible that the following message is not received because
// it can be sent before the queue, binding or consumer exist
var msg = new Amqp.Message("Test");
exchange.send(msg);

connection.completeConfiguration().then(() => {
    // the following message will be received because
    // everything you defined earlier for this connection now exists
    var msg2 = new Amqp.Message("Test2");
    exchange.send(msg2);
});
```

##### Javascript Example
```JavaScript
var amqp = require("amqp-ts");

var connection = new amqp.Connection("amqp://localhost");
var exchange = connection.declareExchange("ExchangeName");
var queue = connection.declareQueue("QueueName");
queue.bind(exchange);
queue.activateConsumer((message) => {
    console.log("Message received: " + message.getContent());
});

// it is possible that the following message is not received because
// it can be sent before the queue, binding or consumer exist
var msg = new amqp.Message("Test");
exchange.send(msg);

connection.completeConfiguration().then(() => {
    // the following message will be received because
    // everything you defined earlier for this connection now exists
    var msg2 = new amqp.Message("Test2");
    exchange.send(msg2);
});
```

More examples can be found in the [tutorials directory](https://github.com/abreits/amqp-ts/tree/master/tutorials).


### Automatic Reconnection    <a name="reconnect"></a>

When the library detects that the connection with the AMQP server is lost, it tries to automatically reconnect to the server.


What's new    <a name="whatsnew"></a>
----------
### version 1.4.0
 - now you can return a `Promise` with `queue.activateConsumer` for RPC's.
   The result of the resolved `Promise` will be returned to the RPC caller.

### version 1.3.0
 - added `noCreate` creation option property for `Exchange` and `Queue` (expects the exchange or queue to already exist
   in AMQP)
 - improved unit tests

### version 1.2.0
 - added `name` property for `Exchange` and `Queue` and `type` property for `Exchange`
 - improved consumer cleanup for `Exchange` and `Queue` methods `close` and `delete`

### version 1.1.1
 - added the `prefetch` option to `DeclarationOptions` in the `amqp-ts.d.ts` file

### version 1.1.0
 - fixed incorrect implementation of nack, syntax is now in line with [amqplib nack](http://www.squaremobius.net/amqp.node/channel_api.html#channel_nack)

### version 1.0.1
 - fixed bug in automatic reconnect (exponential growth of retries hanging the application)

### version 1.0.0
 - updated typescript definition file management from [tsd](https://github.com/DefinitelyTyped/tsd) to [typings](https://github.com/typings/typings)
 - added [queue.prefetch](https://github.com/abreits/amqp-ts/wiki/Queue class#prefetch) and [queue.recover](https://github.com/abreits/amqp-ts/wiki/Queue class#recover) methods
 - updated to version 1.0 (finally)

### version 0.14.4
 - fixed error when using node.js version 0.10.x: `path` library does not have a method `parse` in 0.10.x

### version 0.14.3
 - improved readability of readme.md on npmjs

### version 0.14.2
 - multiple calls of `exchange.close`, `exchange.delete`, `queue.close` and `queue.delete` return the same promise (and are thereby executed only once)

### version 0.14.1
 - added extra promise rejection handling for `exchange.close`, `exchange.delete`, `queue.close` and `queue.delete`

### version 0.14.0
 - changed the return type of [exchange.rpc](https://github.com/abreits/amqp-ts/wiki/Exchange%20class#rpc) and [queue.rpc](https://github.com/abreits/amqp-ts/wiki/Queue%20class#rpc) from 'Promise < any >' to 'Promise < [Message](https://github.com/abreits/amqp-ts/wiki/Message%20class) >'
 - added the option to return a Message in [exchange.activateConsumer](https://github.com/abreits/amqp-ts/wiki/Exchange%20class#activateConsumer) and [queue.activateConsumer](https://github.com/abreits/amqp-ts/wiki/Queue%20class#activateConsumer)
 - updated the [amqp-ts Wiki](https://github.com/abreits/amqp-ts/wiki) API documentation

### version 0.13.0
 - skipped to avoid bad luck :)

### version 0.12.0
 - added [Message class](https://github.com/abreits/amqp-ts/wiki/Message%20class)
 - added [exchange.send](https://github.com/abreits/amqp-ts/wiki/Exchange%20class#send) and [queue.send](https://github.com/abreits/amqp-ts/wiki/Queue%20class#send).
 - deprecated [exchange.publish](https://github.com/abreits/amqp-ts/wiki/Exchange%20class#publish) and [queue.publish](https://github.com/abreits/amqp-ts/wiki/Queue%20class#publish).
 - added [exchange.activateConsumer](https://github.com/abreits/amqp-ts/wiki/Exchange%20class#activateConsumer) and [queue.activateConsumer](https://github.com/abreits/amqp-ts/wiki/Queue%20class#activateConsumer).
 - deprecated [exchange.startConsumer](https://github.com/abreits/amqp-ts/wiki/Exchange%20class#startConsumer) and [queue.startConsumer](https://github.com/abreits/amqp-ts/wiki/Queue%20class#startConsumer).
 - changed [connection.declareExchange](https://github.com/abreits/amqp-ts/wiki/Connection%20class#declareExchange)
   and [connection.declareQueue](https://github.com/abreits/amqp-ts/wiki/Connection%20class#declareQueue)
   to prevent duplicate declaration of the same exchange/queue
 - added [connection.declareTopology](https://github.com/abreits/amqp-ts/wiki/Connection%20class#declareTopology)
 - added support functions [getMessageContent] and [setMessageContent]
 - fixed bug in integration test

### version 0.11.0
 - revised amqp-ts logging, see [Logging](https://github.com/abreits/amqp-ts/wiki/Logging) in the wiki for more details
 - fixed bug in tutorials library reference

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
