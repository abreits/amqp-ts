AmqpSimple
==========

- [Overview](#overview)
- [Lazy Initialization](#lazy)
- [Automatic Reconnection](#reconnect)
- [Logging](#logging)
- [API reference](#api)


Overview    <a name="overview"></a>
--------

A library for nodejs that simplifies communication with AMQP message busses. It has been tested on RabbitMQ. It is based on the [amqplib](http://www.squaremobius.net/amqp.node/) library by [Michael Bridgen (squaremo)](https://github.com/squaremo).

TODO: more overview: Written in Typescript, supports typescript 1.6 module type definition resolution, work in progress, etc.


Lazy Initialization    <a name="lazy"></a>
-------------------

No need to nest functionality, just create a connection, declare your exchanges, queues and
bindings and send and receive messages. The library takes care of dependencies in the
background.

If you define an exchange and a queue and bind the queue to the exchange and want to make
sure that the queue is connected to the exchange when you send a message to the exchange you can call the `connection.completeConfiguration()` method and act on the promise it returns.

### Typescript Example

    import * as Amqp from "AmqpSimple";

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
        // this message will be received because
        // everything you defined earlier for this connection now exists
        exchange.send("Test2");
    });


Automatic Reconnection    <a name="reconnect"></a>
----------------------

When the library detects that the connection with the AMQP server is lost, it tries to automatically reconnect to the server.

TODO: more expanation

Logging    <a name="logging"></a>
-------

TODO: describe winston configuration

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
  - [bind](#exchange_bind)
  - [unbind](#exchange_unbind)
  - [publish](#exchange_publish)
  - [consumerQueueName](#exchange_consumerQueueName)
  - [startConsumer](#exchange_startConsumer)
  - [stopConsumer](#exchange_stopConsumer)
  - [initialized](#exchange_initialized)
- [Queue](#queue)
  - [constructor](#queue_constructor)
  - [delete](#queue_delete)
  - [bind](#queue_bind)
  - [unbind](#queue_unbind)
  - [publish](#queue_publish)
  - [startConsumer](#queue_startConsumer)
  - [stopConsumer](#queue_stopConsumer)
  - [initialized](#queue_initialized)
- [Binding](#binding)
  - [constructor](#binding_constructor)
  - [delete](#binding_delete)




### Connection class    <a name="connection_constructor"></a>

The connection class defines the connection with the AMQP server.

#### methods

###### `constructor(url?: string, socketOptions?: any, reconnectStrategy?: ReconnectStrategy)`    <a name="connection_constructor"></a>
> Creates a new connection to an AMQP server
>
> parameters
> -   `url?: string` : amqp connection string in [amqplib.connect](http://www.squaremobius.net/amqp.node/channel_api.html#connect) format, defaults to `'amqp://localhost'`.
> -   `socketOptions?: any` : socket options as explained in [amqplib.connect](http://www.squaremobius.net/amqp.node/channel_api.html#connect).
> -   `reconnectStrategy?: ReconnectStrategy` : defines the reconnection strategy used, defaults to `{retries: 0 //forever//, interval: 1500 //ms//}`.
>
> example
>
>     import * as Amqp from "AmqpSimple";
>
>     var connection = new Amqp.Connection("amqp://localhost?heartbeat=60");

##### `connection.close(): Promise<void>`    <a name="connection_close"></a>
> Closes the connection
>
> result
> -   `Promise<void>` : promise that resolves when the connection is closed.
>
> example
>
>     connection.close();

##### `connection.declareExchange(name: string, type?: string, options?: Amqp.Options.AssertExchange): Exchange`    <a name="connection_declareExchange"></a>
> Connect to the exchange on the server and create it if it does not already exist.
>
> parameters
> -   `name: string` : exchange name.
> -   `type?: string` : exchange type, a  valid AMQP exchange type name.
> -   `options?: Amqp.Options.AssertExchange` : exchange options as defined in [amqplib](http://www.squaremobius.net/amqp.node/channel_api.html#channel_assertExchange).
>
> result
> -   `Exchange` : the declared exchange.
>
> example
>
>     connection.declareExchange("exchangeName", "amq.topic", {durable: false});

##### `connection.declareQueue(name: string, options?: Amqp.Options.AssertQueue): Queue`    <a name="connection_declareQueue"></a>
> Connect to the queue on the server and create it if it does not already exist.
>
> parameters
> -   `name: string` : queue name.
> -   `options?: Amqp.Options.AssertQueue` : exchange options as defined in [amqplib](http://www.squaremobius.net/amqp.node/channel_api.html#channel_assertQueue).
>
> result
> -   `Queue` : the declared queue.
>
> example
>
>     connection.declareQueue("queueName", {durable: false});

##### `connection.completeConfiguration(): Promise<any>`    <a name="connection_completeConfiguration"></a>
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

##### `connection.deleteConfiguration(): Promise<any>`    <a name="connection_deleteConfiguration"></a>
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

#### properties

##### `connection.initialized: Promise<void>;`    <a name="connection_initialized"></a>
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





### Exchange class    <a name="exchange"></a>

The Exchange class defines an AMQP exchange. Normally only created from within a connection with `declareExchange()`.

#### methods

###### `constructor (connection: Connection, name: string, type?: string, options?: Amqp.Options.AssertExchange)`    <a name="exchange_constructor"></a>
> Creates an exchange for a connection. Normally only called from within a connection with `declareExchange()`.
>
> parameters
> -   `connection: Connection` : Connection this exchange is declared for
> -   `name: string` : exchange name.
> -   `type?: string` : exchange type, a  valid AMQP exchange type name.
> -   `options?: Amqp.Options.AssertExchange` : exchange options as defined in [amqplib](http://www.squaremobius.net/amqp.node/channel_api.html#channel_assertExchange).
>
> example
>
>     // normally not used directly, but from a connection
>     connection.declareExchange("exchangeName", "amq.topic", {durable: false});
>     // calls internally
>     var exchange = new Exchange(connection, "exchangeName", "amq.topic", {durable: false});

##### `exchange.delete(): Promise<void>`    <a name="exchange_delete"></a>
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

##### `exchange.bind(source: Exchange, pattern?: string, args?: any): Promise<Binding>`    <a name="exchange_bind"></a>
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

##### `exchange.unbind(source: Exchange, pattern?: string, args?: any): Promise<binding>`    <a name="exchange_unbind"></a>
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

##### `exchange.publish(content: any, routingKey?: string, options?: any): void`    <a name="exchange_publish"></a>
> Publish a message to an exchange
>
> parameters
> -   `content: any` : the content to be sent to the exchange. the following preprocessing takes place if it is a
>   - *Buffer* : send the content as is (no preprocessing)
>   - *string* : create a Buffer from the string and send that buffer
>   - *everything else* : create a Buffer from the to JSON converted object ond, if not undefined, set the contentType option to `"application/json"`
> -   `routingKey?: string` : routing key for the message, defaults to `""`.
> -   `options?: any` : publish options as defined in [amqplib](http://www.squaremobius.net/amqp.node/channel_api.html#channel_publish).
>
> example
>
>     exchange.publish("ExampleMessageString");

##### `exchange.consumerQueueName(): string`    <a name="exchange_consumerQueueName"></a>
> Returns a meaningfull unique name for the default consumer queue of the exchange.
> The default unique names generated by RabbitMQ are rather cryptic for an administrator, this can help.

##### `exchange.startConsumer(onMessage: (msg: any) => void, options?: Amqp.Options.Consume): Promise<any>`    <a name="exchange_startConsumer"></a>
> Define the function that can process messages for this exchange.
> Only one consumer can be active per exchange.
> Under water it creates a consumerqueue with consumerQueueName that is bound to the exchange, from which the messages are read.
>
> parameters
> -   `onMessage: (msg: any) => void` : function that processes the messages.
> -   `options?: Amqp.Options.Consume` : consumer options as defined in [amqplib](http://www.squaremobius.net/amqp.node/channel_api.html#channel_consume).
>
> result
> -   `Promise<any>` : promise that resolves when the consumer is started
>
> example
>
>     exchange.startConsumer((msg) => {
>         console.log(msg);
>     };

##### `exchange.stopConsumer(): Promise<any>`    <a name="exchange_stopConsumer"></a>
> Stops the consumer function and deletes the queue and binding created in startConsumer.
>
> result
> -   `Promise<any>` : promise that resolves when the consumer is stopped
>
> example
>
>     exchange.stopConsumer();

#### properties

##### `exchange.initialized: Promise<void>;`    <a name="exchange_initialized"></a>
> indicates whether the exchange initialization is resolved (or rejected)
>
> example
>
>     exchange.initialized.then(() => {
>         // stuff to do
>     }
>     exchange.initialized.catch(() => {
>         // something went wrong
>     }





### Queue class    <a name="queue"></a>

The Queue class defines an AMQP queue. Normally only created from within a connection with `declareQueue()`.

#### methods

###### `constructor (connection: Connection, name: string, type?: string, options?: Amqp.Options.AssertQueue)`    <a name="queue_constructor"></a>
> Creates an queue for a connection. Normally only called from within a connection with `declareQueue()`.
>
> parameters
> -   `connection: Connection` : Connection this queue is declared for
> -   `name: string` : queue name.
> -   `type?: string` : queue type, a  valid AMQP queue type name.
> -   `options?: Amqp.Options.AssertQueue` : queue options as defined in [amqplib](http://www.squaremobius.net/amqp.node/channel_api.html#channel_assertQueue).
>
> example
>
>     // normally not used directly, but from a connection
>     connection.declareQueue("queueName", "amq.topic", {durable: false});
>     // calls internally
>     var queue = new Queue(connection, "queueName", "amq.topic", {durable: false});

##### `queue.delete(): Promise<void>`    <a name="queue_delete"></a>
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

##### `queue.bind(source: Exchange, pattern?: string, args?: any): Promise<Binding>`    <a name="queue_bind"></a>
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

##### `queue.unbind(source: Exchange, pattern?: string, args?: any): Promise<binding>`    <a name="queue_unbind"></a>
> Remove binding.
>
> parameters
> -   `source: Exchange` : source exchange this queue is connected to.
> -   `pattern?: string` : pattern that defines which messages will be received, defaults to `""`.
> -   `args?: any` : object containing extra arguments that may be required for the particular exchange type
>
> result
> -   `Promise<Binding>` : promise that resolves when the binding is removed
>
> example
>
>     destQueue.unbind(sourceExchange).then(() => {
>         // do things when the binding is removed
>     });

##### `queue.publish(content: any, routingKey?: string, options?: any): void`    <a name="queue_publish"></a>
> Publish a message to an queue
>
> parameters
> -   `content: any` : the content to be sent to the queue. the following preprocessing takes place if it is a
>   - *Buffer* : send the content as is (no preprocessing)
>   - *string* : create a Buffer from the string and send that buffer
>   - *everything else* : create a Buffer from the to JSON converted object ond, if not undefined, set the contentType option to `"application/json"`
> -   `routingKey?: string` : routing key for the message, defaults to `""`.
> -   `options?: any` : publish options as defined in [amqplib](http://www.squaremobius.net/amqp.node/channel_api.html#channel_publish).
>
> example
>
>     queue.publish("ExampleMessageString");

##### `queue.startConsumer(onMessage: (msg: any) => void, options?: Amqp.Options.Consume): Promise<any>`    <a name="queue_startConsumer"></a>
> Define the function that can process messages for this queue.
> Only one consumer can be active per queue.
> Under water it creates a consumerqueue with consumerQueueName that is bound to the queue, from which the messages are read.
>
> parameters
> -   `onMessage: (msg: any) => void` : function that processes the messages.
> -   `options?: Amqp.Options.Consume` : consumer options as defined in [amqplib](http://www.squaremobius.net/amqp.node/channel_api.html#channel_consume).
>
> result
> -   `Promise<any>` : promise that resolves when the consumer is started
>
> example
>
>     queue.startConsumer((msg) => {
>         console.log(msg);
>     };

##### `queue.stopConsumer(): Promise<any>`    <a name="queue_stopConsumer"></a>
> Stops the consumer function and deletes the queue and binding created in startConsumer.
>
> result
> -   `Promise<any>` : promise that resolves when the consumer is stopped
>
> example
>
>     queue.stopConsumer();

#### properties

##### `queue.initialized: Promise<void>;`    <a name="queue_initialized"></a>
> indicates whether the queue initialization is resolved (or rejected)
>
> example
>
>     queue.initialized.then(() => {
>         // stuff to do
>     }
>     queue.initialized.catch(() => {
>         // something went wrong
>     }





### Binding class    <a name="binding"></a>

The Binding class defines a unidirectional connection between a queue and an exchange or an exchange and another exchange
Normally only created from within a queue or exchange connection with `bind()` and removed with `unbind()`.

#### methods

###### `constructor (destination: Exchange | Queue, source: Exchange, pattern?: string, args?: any)`    <a name="queue_constructor"></a>
> Creates a uniderectional binding from an exchange to a queue or exchange. Normally only created from within a queue or exchange with `bind()`.
>
> parameters
> -   `destination: Exchange | Queue` : Destination for this binding
> -   `source: Exchange` : Source exchange for this binding.
> -   `pattern?: string` : pattern that defines which messages will be received, defaults to `""`.
> -   `args?: any` : object containing extra arguments that may be required for the particular exchange type
>
> example
>
>     // normally not used directly, but from a queue or exchange
>     queue.bind(exchange);
>     destExchange.bind(sourceExchange);
>     // but can also be called directly
>     var binding = new Binding(logQueue, exchange, "*.log");

##### binding.delete(): Promise<void>    <a name="queue_delete"></a>
> Removes the binding. Normally only called from within a queue or exchange with `unbind()`.
>
> result
> -   `Promise<void>` : promise that resolves when the binding is removed (or rejects when an error has occurred).
>
> example
>
>     // normally not used directly, but from a queue or exchange
>     queue.unbind(exchange);
>     destExchange.unbind(sourceExchange);
>     // but can also be called directly
>     binding.delete().then(() => {
>         // do things when the binding is removed
>     });
