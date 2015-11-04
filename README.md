amqp-ts (AMQP TypeScript)
=========================

- [Overview](#overview)
- [What's new](#whatsnew)
- [Roadmap](#roadmap)
- [Building the library](#build)
- [API reference](doc/api)


Overview    <a name="overview"></a>
--------

Amqp-ts is a library for nodejs that simplifies communication with AMQP message busses written in Typescript. It has been tested on RabbitMQ. It uses the [amqplib](http://www.squaremobius.net/amqp.node/) library by [Michael Bridgen (squaremo)](https://github.com/squaremo).

This is a work in progress, currently in a late beta state.

It is compatible with the Typescript 1.6 module type definition resulution for node.js.

It does depend on the following npm libraries:
- [bluebird](https://github.com/petkaantonov/bluebird)
- [winston](https://github.com/winstonjs/winston)

The DefinitelyTyped [tsd] tool is used to manage the typescript type definitions.


### Lazy Initialization

No need to nest functionality, just create a connection, declare your exchanges, queues and
bindings and send and receive messages. The library takes care of any direct dependencies.

If you define an exchange and a queue and bind the queue to the exchange and want to make
sure that the queue is connected to the exchange before you send a message to the exchange you can call the `connection.completeConfiguration()` method and act on the promise it returns.

#### ES6/Typescript Example

    import * as Amqp from "amqp-ts";

    var connection = new Amqp.Connection("amqp://localhost");
    var exchange = connection.declareExchange("ExchangeName");
    var queue = connection.bind("QueueName");
    queue.bind(exchange);
    queue.startConsumer((message) => {
        console.log("Message received: " + message);
    }

    // it is possible that the following message is not received because
    // it can be sent before the queue, binding or consumer exist
    exchange.send("Test");

    connection.completeConfiguration().then(() => {
        // the following message will be received because
        // everything you defined earlier for this connection now exists
        exchange.send("Test2");
    });

#### Javascript Example

    var Amqp = require("amqp-ts");

    var connection = new Amqp.Connection("amqp://localhost");
    var exchange = connection.declareExchange("ExchangeName");
    var queue = connection.bind("QueueName");
    queue.bind(exchange);
    queue.startConsumer(function (message) {
        console.log("Message received: " + message);
    }

    // it is possible that the following message is not received because
    // it can be sent before the queue, binding or consumer exist
    exchange.send("Test");

    connection.completeConfiguration().then(function () {
        // the following message will be received because
        // everything you defined earlier for this connection now exists
        exchange.send("Test2");
    });


### Automatic Reconnection

When the library detects that the connection with the AMQP server is lost, it tries to automatically reconnect to the server.

This is still an experimental feature and has not been thoroughly tested.

### Logging    <a name="logging"></a>

TODO: describe winston configuration. Maybe changed or removed in future versions.



What's new    <a name="whatsnew"></a>
----------

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

 - Move (sections of) this (rather large) readme page to the wiki
 - Better source code documentation, maybe even use jsdoc or tsdoc to generate the api documentation
 - Look into better logging facilities



Building the library    <a name="build"></a>
--------------------

If you want to build the library from the typescript source yourself, you need to have the `gulp` and `tsd` global npm modules installed:

    [sudo] npm install -g gulp tsd

Before you can start you need to install dependencies and type definitions using the following commands:

    npm install
    tsd install

For the tests to complete you need to have access to an AMQP server such as [RabbitMQ](https://www.rabbitmq.com/).
The default connection url for the server is `amqp://localhost`, you can override it by defining the connection url
in the `AMQPTEST_CONNECTION_URL` environment setting.

You can build and test the library using gulp:

    gulp
    gulp test:coverage
    gulp test:integration

The integration tests only work in windows at the moment and need to have enough privileges to stop and restart the RabbitMQ service, so you probably need to start this from an admin command prompt.



API Reference    <a name="api"></a>
-------------

- [Connection](#connection)
  - [constructor](#connection_constructor)
  - [close](#connection_close)
  - [declareExchange](#connection_declareExchange)
  - [declareQueue](#connection_declareQueue)
  - [completeConfiguration](#connection_completeConfiguration)
  - [deleteConfiguration](#connection_deleteConfiguration)
  - [initialized](#connection_initialized)
- [Exchange](#exchange)
  - [constructor](#exchange_constructor)
  - [delete](#exchange_delete)
  - [close](#exchange_close)
  - [bind](#exchange_bind)
  - [unbind](#exchange_unbind)
  - [publish](#exchange_publish)
  - [rpc](#exchange_rpc)
  - [consumerQueueName](#exchange_consumerQueueName)
  - [startConsumer](#exchange_startConsumer)
  - [stopConsumer](#exchange_stopConsumer)
  - [initialized](#exchange_initialized)
- [Queue](#queue)
  - [constructor](#queue_constructor)
  - [delete](#queue_delete)
  - [close](#queue_close)
  - [bind](#queue_bind)
  - [unbind](#queue_unbind)
  - [publish](#queue_publish)
  - [rpc](#queue_rpc)
  - [startConsumer](#queue_startConsumer)
  - [stopConsumer](#queue_stopConsumer)
  - [initialized](#queue_initialized)




### Connection class    <a name="connection"></a>

The connection class defines the connection with the AMQP server.

#### methods

###### constructor (url?: string, socketOptions?: any, reconnectStrategy?: ReconnectStrategy)    <a name="connection_constructor"></a>
> Creates a new connection to an AMQP server
>
> parameters
> -   `url?: string` : amqp connection string in [amqplib.connect](http://www.squaremobius.net/amqp.node/channel_api.html#connect) format, defaults to `"amqp://localhost"`.
> -   `socketOptions?: any` : socket options as explained in [amqplib.connect](http://www.squaremobius.net/amqp.node/channel_api.html#connect).
> -   `reconnectStrategy?: ReconnectStrategy` : defines the reconnection strategy used, defaults to `{retries: 0 //forever//, interval: 1500 //ms//}`.
>
> example
>
>     import * as Amqp from "amqp-ts";
>
>     var connection = new Amqp.Connection("amqp://localhost?heartbeat=60");
[back to API reference](#api)

##### connection.close (): Promise < void >    <a name="connection_close"></a>
> Closes the connection
>
> result
> -   `Promise<void>` : promise that resolves when the connection is closed.
>
> example
>
>     connection.close();
[back to API reference](#api)

##### connection.declareExchange (name: string, type?: string, options?: Exchange.DeclarationOptions): Exchange    <a name="connection_declareExchange"></a>
> Connect to the exchange on the server and create it if it does not already exist.
>
> parameters
> -   `name: string` : exchange name.
> -   `type?: string` : exchange type, a  valid AMQP exchange type name.
> -   `options?: Exchange.DeclarationOptions` : exchange options as defined in [amqplib](http://www.squaremobius.net/amqp.node/channel_api.html#channel_assertExchange).
>
> result
> -   `Exchange` : the declared exchange.
>
> example
>
>     connection.declareExchange("exchangeName", "amq.topic", {durable: false});
[back to API reference](#api)

##### connection.declareQueue (name: string, options?: Queue.DeclarationOptions): Queue    <a name="connection_declareQueue"></a>
> Connect to the queue on the server and create it if it does not already exist.
>
> parameters
> -   `name: string` : queue name.
> -   `options?: Queue.DeclarationOptions` : exchange options as defined in [amqplib](http://www.squaremobius.net/amqp.node/channel_api.html#channel_assertQueue).
>
> result
> -   `Queue` : the declared queue.
>
> example
>
>     connection.declareQueue("queueName", {durable: false});
[back to API reference](#api)

##### connection.completeConfiguration (): Promise < void >    <a name="connection_completeConfiguration"></a>
> Makes sure every defined Exchange, Queue and Binding for this Connection is resolved.
>
> result
> -   `Promise<any>` : promise that resolves when all defined exchanges, queues and bindings for the connection are resolved.
>
> example
>
>     connection.completeConfiguration().then(() => {
>         // do things when everything is in place
>     });
[back to API reference](#api)

##### connection.deleteConfiguration (): Promise < void >    <a name="connection_deleteConfiguration"></a>
> Deletes every defined Exchange, Queue and Binding defined in this Connection.
> <br>**warning:** this deletes the exchanges, queues and bindings from the AMQP server, even if they already existed before.
>
>
> result
> -   `Promise<any>` : promise that resolves when all defined exchanges, queue and bindings in the connection have been deleted.
>
> example
>
>     connection.deleteConfiguration().then(() => {
>         // everything we created has been removed from the server
>         connection.close();
>     });
[back to API reference](#api)

#### properties

##### connection.initialized: Promise < void >    <a name="connection_initialized"></a>
> indicates whether the connection initialization is resolved (or rejected)
>
> example
>
>     connection.initialized.then(() => {
>         // stuff to do
>     }
>     connection.initialized.catch(() => {
>         // something went wrong
>     }
[back to API reference](#api)





### Exchange class    <a name="exchange"></a>

The Exchange class defines an AMQP exchange. Normally only created from within a connection with `declareExchange()`.

#### methods

###### constructor (connection: Connection, name: string, type?: string, options?: Exchange.DeclarationOptions)    <a name="exchange_constructor"></a>
> Creates an exchange for a connection. Normally only called from within a connection with `declareExchange()`.
>
> parameters
> -   `connection: Connection` : Connection this exchange is declared for
> -   `name: string` : exchange name.
> -   `type?: string` : exchange type, a  valid AMQP exchange type name.
> -   `options?: Exchange.DeclarationOptions` : exchange options as defined in [amqplib](http://www.squaremobius.net/amqp.node/channel_api.html#channel_assertExchange).
>
> example
>
>     // normally not used directly, but from a connection
>     connection.declareExchange("exchangeName", "amq.topic", {durable: false});
>     // calls internally
>     var exchange = new Exchange(connection, "exchangeName", "amq.topic", {durable: false});
[back to API reference](#api)

##### exchange.delete (): Promise < void >    <a name="exchange_delete"></a>
> Delete the exchange
>
> result
> -   `Promise<void>` : promise that resolves when the exchange is deleted (or an error has occurred).
>
> example
>
>     exchange.delete().then(() => {
>         // do things when the exchange is deleted
>     });
[back to API reference](#api)

##### exchange.close (): Promise < void >    <a name="exchange_close"></a>
> Close the exchange only in amqp-ts, does not delete a persistent exchange
>
> result
> -   `Promise<void>` : promise that resolves when the exchange is closed (or an error has occurred).
>
> example
>
>     exchange.delete().then(() => {
>         // do things when the exchange is deleted
>     });
[back to API reference](#api)

##### exchange.bind (source: Exchange, pattern?: string, args?: any): Promise < void >    <a name="exchange_bind"></a>
> Bind this exchange to another exchange (RabbitMQ extension).
>
> parameters
> -   `source: Exchange` : source exchange this exchange is connected to.
> -   `pattern?: string` : pattern that defines which messages will be received, defaults to `""`.
> -   `args?: any` : object containing extra arguments that may be required for the particular exchange type
>
> result
> -   `Promise<Binding>` : promise that resolves when the binding is initialized
>
> example
>
>     // normal use
>     destExchange.bind(sourceExchange);
>
>     // less frequently used, but may be useful in certain situations
>     destExchange.bind(sourceExchange).then((binding) => {
>         // do things when the binding is initialized
>     });
[back to API reference](#api)

##### exchange.unbind (source: Exchange, pattern?: string, args?: any): Promise < void >    <a name="exchange_unbind"></a>
> Remove binding.
>
> parameters
> -   `source: Exchange` : source exchange this exchange is connected to.
> -   `pattern?: string` : pattern that defines which messages will be received, defaults to `""`.
> -   `args?: any` : object containing extra arguments that may be required for the particular exchange type
>
> result
> -   `Promise<Binding>` : promise that resolves when the binding is removed
>
> example
>
>     destExchange.unbind(sourceExchange).then(() => {
>         // do things when the binding is removed
>     });
[back to API reference](#api)

##### exchange.publish (content: any, routingKey?: string, options?: any): void    <a name="exchange_publish"></a>
> Publish a message to an exchange
>
> parameters
> -   `content: any` : the content to be sent to the exchange. the following preprocessing takes place if it is a
>   - *Buffer* : send the content as is (no preprocessing)
>   - *string* : create a Buffer from the string and send that buffer
>   - *everything else* : create a Buffer from the to JSON converted object and, if not defined, set the contentType option to `"application/json"`
> -   `routingKey?: string` : routing key for the message, defaults to `""`.
> -   `options?: any` : publish options as defined in [amqplib](http://www.squaremobius.net/amqp.node/channel_api.html#channel_publish).
>
> example
>
>     exchange.publish("ExampleMessageString");
[back to API reference](#api)

##### exchange.rpc(requestParameters: any, routingKey = ""): Promise<any>    <a name="exchange_rpc"></a>
> Execute a [RabbitMQ 'direct reply-to'](https://www.rabbitmq.com/direct-reply-to.html) remote procedure call
>
> parameters
> -   `requestParameters: any` : the rpc parameters to be sent to the exchange. the following preprocessing takes place if it is a
>   - *Buffer* : send the content as is (no preprocessing)
>   - *string* : create a Buffer from the string and send that buffer
>   - *everything else* : create a Buffer from the to JSON converted object and, if not defined, set the contentType option to `"application/json"`
> -   `routingKey?: string` : routing key for the message, defaults to `""`.
>
> result
> -   `Promise<any>` : promise that resolves when the result is received
>
> example
>
>     exchange.rpc("Parameters").then((result) => {
>       console.log("Rpc result: " + result);
>     });
[back to API reference](#api)

##### exchange.consumerQueueName (): string    <a name="exchange_consumerQueueName"></a>
> Returns a meaningfull unique name for the default consumer queue of the exchange.
> The default unique names generated by RabbitMQ are rather cryptic for an administrator, this can help.
[back to API reference](#api)

##### exchange.startConsumer (onMessage: (msg: any, channel?: AmqpLib.Channel) => any, options?: Queue.StartConsumerOptions): Promise < void >    <a name="exchange_startConsumer"></a>
> Define the function that can process messages for this exchange.
> Only one consumer can be active per exchange.
> Under water it creates a consumerqueue with consumerQueueName that is bound to the exchange, from which the messages are read.
>
> parameters
> -   `onMessage: (msg: any, channel?: AmqpLib.Channel) => any` : function that processes the messages.
> -   `options?: Queue.StartConsumerOptions` : consumer options as defined in [amqplib](http://www.squaremobius.net/amqp.node/channel_api.html#channel_consume).
> An extra property `rawMessage` has been added to allow more low level message processing, see [queue.startConsumer](#queue_startConsumer) for more details.
>
> result
> -   `Promise<any>` : promise that resolves when the consumer is started
>
> example
>
>     exchange.startConsumer((msg) => {
>         console.log(msg);
>     };
[back to API reference](#api)

##### exchange.stopConsumer (): Promise < void >    <a name="exchange_stopConsumer"></a>
> Stops the consumer function and deletes the queue and binding created in startConsumer.
>
> result
> -   `Promise<any>` : promise that resolves when the consumer is stopped
>
> example
>
>     exchange.stopConsumer();
[back to API reference](#api)

#### properties

##### exchange.initialized: Promise < Exchange.InitializeResult >    <a name="exchange_initialized"></a>
> indicates whether the exchange initialization is resolved (or rejected)
>
> example
>
>     exchange.initialized.then((result) => {
>         console.log("Exchange initialized: " + result.exchange);
>         // stuff to do
>     }
>     exchange.initialized.catch(() => {
>         // something went wrong
>     }
[back to API reference](#api)





### Queue class    <a name="queue"></a>

The Queue class defines an AMQP queue. Normally only created from within a connection with `declareQueue()`.

#### methods

###### constructor (connection: Connection, name: string, type?: string, options?: Queue.StartConsumerOptions)    <a name="queue_constructor"></a>
> Creates an queue for a connection. Normally only called from within a connection with `declareQueue()`.
>
> parameters
> -   `connection: Connection` : Connection this queue is declared for
> -   `name: string` : queue name.
> -   `type?: string` : queue type, a  valid AMQP queue type name.
> -   `options?: Queue.StartConsumerOptions` : queue options as defined in [amqplib](http://www.squaremobius.net/amqp.node/channel_api.html#channel_assertQueue).
>
> example
>
>     // normally not used directly, but from a connection
>     connection.declareQueue("queueName", "amq.topic", {durable: false});
>     // calls internally
>     var queue = new Queue(connection, "queueName", "amq.topic", {durable: false});
[back to API reference](#api)

##### queue.delete (): Promise < void >    <a name="queue_delete"></a>
> Delete the queue
>
> result
> -   `Promise<void>` : promise that resolves when the queue is deleted (or an error has occurred).
>
> example
>
>     queue.delete().then(() => {
>         // do things when the queue is deleted
>     });
[back to API reference](#api)

##### queue.close (): Promise < void >    <a name="queue_close"></a>
> Close the queue only in amqp-ts, does not delete a persistent queue
>
> result
> -   `Promise<void>` : promise that resolves when the queue is closed (or an error has occurred).
>
> example
>
>     queue.delete().then(() => {
>         // do things when the queue is deleted
>     });
[back to API reference](#api)

##### queue.bind (source: Exchange, pattern?: string, args?: any): Promise < void >    <a name="queue_bind"></a>
> Bind this queue to an exchange.
>
> parameters
> -   `source: Exchange` : source exchange this queue is connected to.
> -   `pattern?: string` : pattern that defines which messages will be received, defaults to `""`.
> -   `args?: any` : object containing extra arguments that may be required for the particular exchange type
>
> result
> -   `Promise<Binding>` : promise that resolves when the binding is initialized
>
> example
>
>     // normal use
>     destQueue.bind(sourceExchange);
>
>     // less frequently used, but may be useful in certain situations
>     destQueue.bind(sourceExchange).then((binding) => {
>         // do things when the binding is initialized
>     });
[back to API reference](#api)

##### queue.unbind (source: Exchange, pattern?: string, args?: any): Promise < void >    <a name="queue_unbind"></a>
> Remove binding.
>
> parameters
> -   `source: Exchange` : source exchange this queue is connected to.
> -   `pattern?: string` : pattern that defines which messages will be received, defaults to `""`.
> -   `args?: any` : object containing extra arguments that may be required for the particular exchange type.
>
> result
> -   `Promise<Binding>` : promise that resolves when the binding is removed.
>
> example
>
>     destQueue.unbind(sourceExchange).then(() => {
>         // do things when the binding is removed
>     });
[back to API reference](#api)

##### queue.publish (content: any, routingKey?: string, options?: any): void    <a name="queue_publish"></a>
> Publish a message to an queue.
>
> parameters
> -   `content: any` : the content to be sent to the queue. the following preprocessing takes place if it is a:
>   - *Buffer* : send the content as is (no preprocessing).
>   - *string* : create a Buffer from the string and send that buffer.
>   - *everything else* : create a Buffer from the to JSON converted object and, if not defined, set the contentType option to `"application/json"`.
> -   `routingKey?: string` : routing key for the message, defaults to `""`.
> -   `options?: any` : publish options as defined in [amqplib](http://www.squaremobius.net/amqp.node/channel_api.html#channel_publish).
>
> example
>
>     queue.publish("ExampleMessageString");
[back to API reference](#api)

##### queue.rpc(requestParameters: any): Promise<any>    <a name="queue_rpc"></a>
> Execute a [RabbitMQ 'direct reply-to'](https://www.rabbitmq.com/direct-reply-to.html) remote procedure call.
>
> parameters
> -   `requestParameters: any` : the rpc parameters to be sent to the exchange. the following preprocessing takes place if it is a
>   - *Buffer* : send the content as is (no preprocessing)
>   - *string* : create a Buffer from the string and send that buffer
>   - *everything else* : create a Buffer from the to JSON converted object and, if not defined, set the contentType option to `"application/json"`
> -   `routingKey?: string` : routing key for the message, defaults to `""`.
>
> result
> -   `Promise<any>` : promise that resolves when the result is received
>
> example
>
>     queue.rpc("Parameters").then((result) => {
>       console.log("Rpc result: " + result);
>     });
[back to API reference](#api)

##### queue.startConsumer (onMessage: (msg: any, channel?: AmqpLib.Channel) => any, options?: Queue.StartConsumerOptions): Promise < void >    <a name="queue_startConsumer"></a>
> Define the function that can process messages for this queue.
> Only one consumer can be active per queue.
> Under water it creates a consumerqueue with consumerQueueName that is bound to the queue, from which the messages are read.
>
> parameters
> -   `onMessage: (msg: any, channel?: AmqpLib.Channel) => any` : function that processes the messages.
> If the `rawMessage` option is set to true in the options, the 'raw' message, as defined in [amqplib](http://www.squaremobius.net/amqp.node/channel_api.html#channel_consume), is sent and the amqplib channel is passed as an extra parameter to allow acknowledgement of messages. Otherwise extra processing is done:
>    - the raw message content is converted from a buffer to a string or Object and sent as the msg parameter.
>    - if the raw message contains a 'replyTo' property, the result of the onMessage function is sent back to a queue with that name (used with rpc).
> -   `options?: Queue.StartConsumerOptions` : consumer options as defined in [amqplib](http://www.squaremobius.net/amqp.node/channel_api.html#channel_consume), an extra property `rawMessage` has been added to allow more low level message processing.
>
> result
> -   `Promise<any>` : promise that resolves when the consumer is started
>
> example
>
>     // 'normal' consumer
>     queue.startConsumer((msg) => {
>         console.log(msg); // receives the processed content of the message sent
>     });
>
>     // 'raw' message consumer example
>     function rawConsumerFunction(msg, channel) {
>         console.log(msg.content);
>         console.log(msg.fields);
>         console.log(msg.properties);
>         channel.ack(msg);
>     }
>     queue.startConsumer(rawConsumerFunction, {rawMessage: true});
>
>     // rpc server
>     queue.startConsumer((rpcParameters) => {
>       return rpcParameters.value;
>     });
>     // rpc client
>     var param = {
>       name: "test",
>       value: "This is a test!"
>     }
>     queue.rpc(param).then((result) => {
>       console.log(result); // should result in 'This is a test!'
>     }
[back to API reference](#api)

##### queue.stopConsumer (): Promise < void >    <a name="queue_stopConsumer"></a>
> Stops the consumer function and deletes the queue and binding created in startConsumer.
>
> result
> -   `Promise<any>` : promise that resolves when the consumer is stopped
>
> example
>
>     queue.stopConsumer();
[back to API reference](#api)

#### properties

##### queue.initialized: Promise < Queue.InitializeResult >;    <a name="queue_initialized"></a>
> indicates whether the queue initialization is resolved (or rejected)
>
> example
>
>     queue.initialized.then((result) => {
>         console.log("Queue initialized!");
>         console.log("Queue name", result.name);
>         console.log("Queue messageCount", result.messageCount);
>         console.log("Queue consumerCount", result.consumerCount);
>         // stuff to do
>     }
>     queue.initialized.catch(() => {
>         // something went wrong
>     }
[back to API reference](#api)
