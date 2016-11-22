/**
 * AmqpSimple.ts - provides a simple interface to read from and write to RabbitMQ amqp exchanges
 * Created by Ab on 17-9-2015.
 *
 * methods and properties starting with '_' signify that the scope of the item should be limited to
 * the inside of the enclosing namespace.
 */

// simplified use of amqp exchanges and queues, wrapper for amqplib

import * as AmqpLib from "amqplib/callback_api";
import * as Promise from "bluebird";
import * as winston from "winston";
import * as path from "path";
import * as os from "os";

var ApplicationName = process.env.AMQPTS_APPLICATIONNAME ||
  (path.parse ? path.parse(process.argv[1]).name : path.basename(process.argv[1]));

// create a custom winston logger for amqp-ts
var amqp_log = new winston.Logger({
  transports: [
    new winston.transports.Console({
      level: process.env.AMQPTS_LOGLEVEL || "error"
    })
  ]
});
export var log = amqp_log;

// name for the RabbitMQ direct reply-to queue
const DIRECT_REPLY_TO_QUEUE = "amq.rabbitmq.reply-to";

//----------------------------------------------------------------------------------------------------
// Connection class
//----------------------------------------------------------------------------------------------------
export class Connection {
  initialized: Promise<void>;

  private url: string;
  private socketOptions: any;
  private reconnectStrategy: Connection.ReconnectStrategy;
  private connectedBefore = false;

  _connection: AmqpLib.Connection;
  _retry: number;
  _rebuilding: boolean = false;

  _exchanges: { [id: string]: Exchange };
  _queues: { [id: string]: Queue };
  _bindings: { [id: string]: Binding };

  constructor(url = "amqp://localhost",
    socketOptions: any = {},
    reconnectStrategy: Connection.ReconnectStrategy = { retries: 0, interval: 1500 }) {
    this.url = url;
    this.socketOptions = socketOptions;
    this.reconnectStrategy = reconnectStrategy;
    this._exchanges = {};
    this._queues = {};
    this._bindings = {};

    this.rebuildConnection();
  }

  private rebuildConnection(): Promise<void> {
    if (this._rebuilding) { // only one rebuild process can be active at any time
      log.log("debug", "Connection rebuild already in progress, joining active rebuild attempt.", { module: "amqp-ts" });
      return this.initialized;
    }
    this._retry = -1;
    this._rebuilding = true;

    // rebuild the connection
    this.initialized = new Promise<void>((resolve, reject) => {
      this.tryToConnect(this, 0, (err) => {
        /* istanbul ignore if */
        if (err) {
          this._rebuilding = false;
          reject(err);
        } else {
          this._rebuilding = false;
          if (this.connectedBefore) {
            log.log("warn", "Connection re-established", { module: "amqp-ts" });
          } else {
            log.log("info", "Connection established.", { module: "amqp-ts" });
            this.connectedBefore = true;
          }
          resolve(null);
        }
      });
    });
    /* istanbul ignore next */
    this.initialized.catch((err) => {
      log.log("warn", "Error creating connection!", { module: "amqp-ts" });
      //throw (err);
    });

    return this.initialized;
  }

  private tryToConnect(thisConnection: Connection, retry: number, callback: (err: any) => void): void {
    AmqpLib.connect(thisConnection.url, thisConnection.socketOptions, (err, connection) => {
      /* istanbul ignore if */
      if (err) {
        // only do every retry once, amqplib can return multiple connection errors for one connection request (error?)
        if (retry <= this._retry) {
          //amqpts_log.log("warn" , "Double retry " + retry + ", skipping.", {module: "amqp-ts"});
          return;
        }

        log.log("warn", "Connection failed.", { module: "amqp-ts" });
        this._retry = retry;
        if (thisConnection.reconnectStrategy.retries === 0 || thisConnection.reconnectStrategy.retries > retry) {
          log.log("warn", "Connection retry " + (retry + 1) + " in " + thisConnection.reconnectStrategy.interval + "ms",
            { module: "amqp-ts" });
          setTimeout(thisConnection.tryToConnect,
            thisConnection.reconnectStrategy.interval,
            thisConnection,
            retry + 1,
            callback
          );
        } else { //no reconnect strategy, or retries exhausted, so return the error
          log.log("warn", "Connection failed, exiting: No connection retries left (retry " + retry + ").", { module: "amqp-ts" });
          callback(err);
        }
      } else {
        var restart = (err: Error) => {
          log.log("debug", "Connection error occurred.", { module: "amqp-ts" });
          connection.removeListener("error", restart);
          //connection.removeListener("end", restart); // not sure this is needed
          thisConnection._rebuildAll(err); //try to rebuild the topology when the connection  unexpectedly closes
        };
        connection.on("error", restart);
        //connection.on("end", restart); // not sure this is needed
        thisConnection._connection = connection;

        callback(null);
      }
    });
  }

  _rebuildAll(err: Error): Promise<void> {
    log.log("warn", "Connection error: " + err.message, { module: "amqp-ts" });

    log.log("debug", "Rebuilding connection NOW.", { module: "amqp-ts" });
    this.rebuildConnection();

    //re initialize exchanges, queues and bindings if they exist
    for (var exchangeId in this._exchanges) {
      var exchange = this._exchanges[exchangeId];
      log.log("debug", "Re-initialize Exchange '" + exchange._name + "'.", { module: "amqp-ts" });
      exchange._initialize();
    }
    for (var queueId in this._queues) {
      var queue = this._queues[queueId];
      var consumer = queue._consumer;
      log.log("debug", "Re-initialize queue '" + queue._name + "'.", { module: "amqp-ts" });
      queue._initialize();
      if (consumer) {
        log.log("debug", "Re-initialize consumer for queue '" + queue._name + "'.", { module: "amqp-ts" });
        queue._initializeConsumer();
      }
    }
    for (var bindingId in this._bindings) {
      var binding = this._bindings[bindingId];
      log.log("debug", "Re-initialize binding from '" + binding._source._name + "' to '" +
        binding._destination._name + "'.", { module: "amqp-ts" });
      binding._initialize();
    }

    return new Promise<void>((resolve, reject) => {
      this.completeConfiguration().then(() => {
        log.log("debug", "Rebuild success.", { module: "amqp-ts" });
        resolve(null);
      }, /* istanbul ignore next */
        (rejectReason) => {
          log.log("debug", "Rebuild failed.", { module: "amqp-ts" });
          reject(rejectReason);
        });
    });
  }

  close(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.initialized.then(() => {
        this._connection.close(err => {
          /* istanbul ignore if */
          if (err) {
            reject(err);
          } else {
            resolve(null);
          }
        });
      });
    });
  }

  /**
   * Make sure the whole defined connection topology is configured:
   * return promise that fulfills after all defined exchanges, queues and bindings are initialized
   */
  completeConfiguration(): Promise<any> {
    var promises: Promise<any>[] = [];
    for (var exchangeId in this._exchanges) {
      var exchange: Exchange = this._exchanges[exchangeId];
      promises.push(exchange.initialized);
    }
    for (var queueId in this._queues) {
      var queue: Queue = this._queues[queueId];
      promises.push(queue.initialized);
      if (queue._consumerInitialized) {
        promises.push(queue._consumerInitialized);
      }
    }
    for (var bindingId in this._bindings) {
      var binding: Binding = this._bindings[bindingId];
      promises.push(binding.initialized);
    }
    return Promise.all(promises);
  }

  /**
   * Delete the whole defined connection topology:
   * return promise that fulfills after all defined exchanges, queues and bindings have been removed
   */
  deleteConfiguration(): Promise<any> {
    var promises: Promise<any>[] = [];
    for (var bindingId in this._bindings) {
      var binding: Binding = this._bindings[bindingId];
      promises.push(binding.delete());
    }
    for (var queueId in this._queues) {
      var queue: Queue = this._queues[queueId];
      if (queue._consumerInitialized) {
        promises.push(queue.stopConsumer());
      }
      promises.push(queue.delete());
    }
    for (var exchangeId in this._exchanges) {
      var exchange: Exchange = this._exchanges[exchangeId];
      promises.push(exchange.delete());
    }
    return Promise.all(promises);
  }

  declareExchange(name: string, type?: string, options?: Exchange.DeclarationOptions): Exchange {
    var exchange = this._exchanges[name];
    if (exchange === undefined) {
      exchange = new Exchange(this, name, type, options);
    }
    return exchange;
  }

  declareQueue(name: string, options?: Queue.DeclarationOptions): Queue {
    var queue = this._queues[name];
    if (queue === undefined) {
      queue = new Queue(this, name, options);
    }
    return queue;
  }

  declareTopology(topology: Connection.Topology): Promise<any> {
    var promises: Promise<any>[] = [];
    var i: number;
    var len: number;

    if (topology.exchanges !== undefined) {
      for (i = 0, len = topology.exchanges.length; i < len; i++) {
        var exchange = topology.exchanges[i];
        promises.push(this.declareExchange(exchange.name, exchange.type, exchange.options).initialized);
      }
    }
    if (topology.queues !== undefined) {
      for (i = 0, len = topology.queues.length; i < len; i++) {
        var queue = topology.queues[i];
        promises.push(this.declareQueue(queue.name, queue.options).initialized);
      }
    }
    if (topology.bindings !== undefined) {
      for (i = 0, len = topology.bindings.length; i < len; i++) {
        var binding = topology.bindings[i];
        var source = this.declareExchange(binding.source);
        var destination: Queue | Exchange;
        if (binding.exchange !== undefined) {
          destination = this.declareExchange(binding.exchange);
        } else {
          destination = this.declareQueue(binding.queue);
        }
        promises.push(destination.bind(source, binding.pattern, binding.args));
      }
    }
    return Promise.all(promises);
  }
}
export namespace Connection {
  "use strict";
  export interface ReconnectStrategy {
    retries: number; // number of retries, 0 is forever
    interval: number; // retry interval in ms
  }
  export interface Topology {
    exchanges: { name: string, type?: string, options?: any }[];
    queues: { name: string, options?: any }[];
    bindings: { source: string, queue?: string, exchange?: string, pattern?: string, args?: any }[];
  }
}


//----------------------------------------------------------------------------------------------------
// Message class
//----------------------------------------------------------------------------------------------------
export class Message {
  content: Buffer;
  fields: any;
  properties: any;

  _channel: AmqpLib.Channel; // for received messages only: the channel it has been received on
  _message: AmqpLib.Message; // received messages only: original amqplib message

  constructor(content?: any, options: any = {}) {
    this.properties = options;
    if (content !== undefined) {
      this.setContent(content);
    }
  }

  setContent(content: any): void {
    if (typeof content === "string") {
      this.content = new Buffer(content);
    } else if (!(content instanceof Buffer)) {
      this.content = new Buffer(JSON.stringify(content));
      this.properties.contentType = "application/json";
    } else {
      this.content = content;
    }
  }

  getContent(): any {
    var content = this.content.toString();
    if (this.properties.contentType === "application/json") {
      content = JSON.parse(content);
    }
    return content;
  }

  sendTo(destination: Exchange | Queue, routingKey: string = ""): void {
    // inline function to send the message
    var sendMessage = () => {
      try {
        destination._channel.publish(exchange, routingKey, this.content, this.properties);
      } catch (err) {
        log.log("debug", "Publish error: " + err.message, { module: "amqp-ts" });
        var destinationName = destination._name;
        var connection = destination._connection;
        log.log("debug", "Try to rebuild connection, before Call.", { module: "amqp-ts" });
        connection._rebuildAll(err).then(() => {
          log.log("debug", "Retransmitting message.", { module: "amqp-ts" });
          if (destination instanceof Queue) {
            connection._queues[destinationName].publish(this.content, this.properties);
          } else {
            connection._exchanges[destinationName].publish(this.content, routingKey, this.properties);
          }

        });
      }
    };

    var exchange: string;
    if (destination instanceof Queue) {
      exchange = "";
      routingKey = destination._name;
    } else {
      exchange = destination._name;
    }

    // execute sync when possible
    if (destination.initialized.isFulfilled()) {
      sendMessage();
    } else {
      (<Promise<any>>destination.initialized).then(sendMessage);
    }
  }

  ack(allUpTo?: boolean): void {
    if (this._channel !== undefined) {
      this._channel.ack(this._message, allUpTo);
    }
  }

  nack(allUpTo?: boolean, requeue?: boolean): void {
    if (this._channel !== undefined) {
      this._channel.nack(this._message, allUpTo, requeue);
    }
  }

  reject(requeue = false): void {
    if (this._channel !== undefined) {
      this._channel.reject(this._message, requeue);
    }
  }
}


//----------------------------------------------------------------------------------------------------
// Exchange class
//----------------------------------------------------------------------------------------------------
export class Exchange {
  initialized: Promise<Exchange.InitializeResult>;

  _connection: Connection;
  _channel: AmqpLib.Channel;
  _name: string;
  _type: string;
  _options: Exchange.DeclarationOptions;

  _deleting: Promise<void>;
  _closing: Promise<void>;

  get name() {
    return this._name;
  }

  get type() {
    return this._type;
  }

  constructor(connection: Connection, name: string, type?: string, options: Exchange.DeclarationOptions = {}) {
    this._connection = connection;
    this._name = name;
    this._type = type;
    this._options = options;
    this._initialize();
  }

  _initialize() {
    this.initialized = new Promise<Exchange.InitializeResult>((resolve, reject) => {
      this._connection.initialized.then(() => {
        this._connection._connection.createChannel((err, channel) => {
          /* istanbul ignore if */
          if (err) {
            reject(err);
          } else {
            this._channel = channel;
            let callback = (err, ok) => {
              /* istanbul ignore if */
              if (err) {
                log.log("error", "Failed to create exchange '" + this._name + "'.", { module: "amqp-ts" });
                delete this._connection._exchanges[this._name];
                reject(err);
              } else {
                resolve(<Exchange.InitializeResult>ok);
              }
            };
            if (this._options.noCreate) {
              this._channel.checkExchange(this._name, callback);
            } else {
              this._channel.assertExchange(this._name, this._type, <AmqpLib.Options.AssertExchange>this._options, callback);
            }
          }
        });
      });
    });
    this._connection._exchanges[this._name] = this;
  }

  /**
   * deprecated, use 'exchange.send(message: Message)' instead
   */
  publish(content: any, routingKey = "", options: any = {}): void {
    if (typeof content === "string") {
      content = new Buffer(content);
    } else if (!(content instanceof Buffer)) {
      content = new Buffer(JSON.stringify(content));
      options.contentType = options.contentType || "application/json";
    }
    this.initialized.then(() => {
      try {
        this._channel.publish(this._name, routingKey, content, options);
      } catch (err) {
        log.log("warn", "Exchange publish error: " + err.message, { module: "amqp-ts" });
        var exchangeName = this._name;
        var connection = this._connection;
        connection._rebuildAll(err).then(() => {
          log.log("debug", "Retransmitting message.", { module: "amqp-ts" });
          connection._exchanges[exchangeName].publish(content, routingKey, options);
        });
      }
    });
  }

  send(message: Message, routingKey = ""): void {
    message.sendTo(this, routingKey);
  }

  rpc(requestParameters: any, routingKey = ""): Promise<Message> {
    return new Promise<Message>((resolve, reject) => {
      var processRpc = () => {
        var consumerTag: string;
        this._channel.consume(DIRECT_REPLY_TO_QUEUE, (resultMsg) => {
          this._channel.cancel(consumerTag);
          var result = new Message(resultMsg.content, resultMsg.fields);
          result.fields = resultMsg.fields;
          resolve(result);
        }, { noAck: true }, (err, ok) => {
          /* istanbul ignore if */
          if (err) {
            reject(new Error("amqp-ts: Queue.rpc error: " + err.message));
          } else {
            // send the rpc request
            consumerTag = ok.consumerTag;
            var message = new Message(requestParameters, { replyTo: DIRECT_REPLY_TO_QUEUE });
            message.sendTo(this, routingKey);
          }
        });
      };

      // execute sync when possible
      if (this.initialized.isFulfilled()) {
        processRpc();
      } else {
        this.initialized.then(processRpc);
      }
    });
  }

  delete(): Promise<void> {
    if (this._deleting === undefined) {
      this._deleting = new Promise<void>((resolve, reject) => {
        this.initialized.then(() => {
          return Binding.removeBindingsContaining(this);
        }).then(() => {
          this._channel.deleteExchange(this._name, {}, (err, ok) => {
            /* istanbul ignore if */
            if (err) {
              reject(err);
            } else {
              this._channel.close((err) => {
                delete this.initialized; // invalidate exchange
                delete this._connection._exchanges[this._name]; // remove the exchange from our administration
                /* istanbul ignore if */
                if (err) {
                  reject(err);
                } else {
                  delete this._channel;
                  delete this._connection;
                  resolve(null);
                }
              });
            }
          });
        }).catch((err) => {
          reject(err);
        });
      });
    }
    return this._deleting;
  }

  close(): Promise<void> {
    if (this._closing === undefined) {
      this._closing = new Promise<void>((resolve, reject) => {
        this.initialized.then(() => {
          return Binding.removeBindingsContaining(this);
        }).then(() => {
          delete this.initialized; // invalidate exchange
          delete this._connection._exchanges[this._name]; // remove the exchange from our administration
          this._channel.close((err) => {
            /* istanbul ignore if */
            if (err) {
              reject(err);
            } else {
              delete this._channel;
              delete this._connection;
              resolve(null);
            }
          });
        }).catch((err) => {
          reject(err);
        });
      });
    }
    return this._closing;
  }

  bind(source: Exchange, pattern = "", args: any = {}): Promise<Binding> {
    var binding = new Binding(this, source, pattern, args);
    return binding.initialized;
  }

  unbind(source: Exchange, pattern = "", args: any = {}): Promise<void> {
    return this._connection._bindings[Binding.id(this, source, pattern)].delete();
  }

  consumerQueueName(): string {
    return this._name + "." + ApplicationName + "." + os.hostname() + "." + process.pid;
  }

  /**
   * deprecated, use 'exchange.activateConsumer(...)' instead
   */
  startConsumer(onMessage: (msg: any, channel?: AmqpLib.Channel) => any, options?: Queue.StartConsumerOptions): Promise<any> {
    var queueName = this.consumerQueueName();
    if (this._connection._queues[queueName]) {
      return new Promise<void>((_, reject) => {
        reject(new Error("amqp-ts Exchange.startConsumer error: consumer already defined"));
      });
    } else {
      var promises: Promise<any>[] = [];
      var queue = this._connection.declareQueue(queueName, { durable: false });
      promises.push(queue.initialized);
      var binding = queue.bind(this);
      promises.push(binding);
      var consumer = queue.startConsumer(onMessage, options);
      promises.push(consumer);

      return Promise.all(promises);
    }
  }

  activateConsumer(onMessage: (msg: Message) => any, options?: Queue.ActivateConsumerOptions): Promise<any> {
    var queueName = this.consumerQueueName();
    if (this._connection._queues[queueName]) {
      return new Promise<void>((_, reject) => {
        reject(new Error("amqp-ts Exchange.activateConsumer error: consumer already defined"));
      });
    } else {
      var promises: Promise<any>[] = [];
      var queue = this._connection.declareQueue(queueName, { durable: false });
      promises.push(queue.initialized);
      var binding = queue.bind(this);
      promises.push(binding);
      var consumer = queue.activateConsumer(onMessage, options);
      promises.push(consumer);

      return Promise.all(promises);
    }
  }

  stopConsumer(): Promise<any> {
    var queue = this._connection._queues[this.consumerQueueName()];
    if (queue) {
      return queue.delete();
    } else {
      return Promise.resolve();
    }
  }
}
export namespace Exchange {
  "use strict";
  export interface DeclarationOptions {
    durable?: boolean;
    internal?: boolean;
    autoDelete?: boolean;
    alternateExchange?: string;
    arguments?: any;
    noCreate?: boolean;
  }
  export interface InitializeResult {
    exchange: string;
  }
}


//----------------------------------------------------------------------------------------------------
// Queue class
//----------------------------------------------------------------------------------------------------
export class Queue {
  initialized: Promise<Queue.InitializeResult>;

  _connection: Connection;
  _channel: AmqpLib.Channel;
  _name: string;
  _options: Queue.DeclarationOptions;

  _consumer: (msg: any, channel?: AmqpLib.Channel) => any;
  _isStartConsumer: boolean;
  _rawConsumer: boolean;
  _consumerOptions: Queue.StartConsumerOptions;
  _consumerTag: string;
  _consumerInitialized: Promise<Queue.StartConsumerResult>;
  _consumerStopping: boolean;
  _deleting: Promise<Queue.DeleteResult>;
  _closing: Promise<void>;

  get name() {
    return this._name;
  }

  constructor(connection: Connection, name: string, options: Queue.DeclarationOptions = {}) {
    this._connection = connection;
    this._name = name;
    this._options = options;
    this._connection._queues[this._name] = this;
    this._initialize();
  }

  _initialize(): void {
    this.initialized = new Promise<Queue.InitializeResult>((resolve, reject) => {
      this._connection.initialized.then(() => {
        this._connection._connection.createChannel((err, channel) => {
          /* istanbul ignore if */
          if (err) {
            reject(err);
          } else {
            this._channel = channel;
            let callback = (err, ok) => {
              /* istanbul ignore if */
              if (err) {
                log.log("error", "Failed to create queue '" + this._name + "'.", { module: "amqp-ts" });
                delete this._connection._queues[this._name];
                reject(err);
              } else {
                if (this._options.prefetch) {
                  this._channel.prefetch(this._options.prefetch);
                }
                resolve(<Queue.InitializeResult>ok);
              }
            };

            if (this._options.noCreate) {
              this._channel.checkQueue(this._name, callback);
            } else {
              this._channel.assertQueue(this._name, <AmqpLib.Options.AssertQueue>this._options, callback);
            }
          }
        });
      });
    });
  }

  static _packMessageContent(content: any, options: any): Buffer {
    if (typeof content === "string") {
      content = new Buffer(content);
    } else if (!(content instanceof Buffer)) {
      content = new Buffer(JSON.stringify(content));
      options.contentType = "application/json";
    }
    return content;
  }

  static _unpackMessageContent(msg: AmqpLib.Message): any {
    var content = msg.content.toString();
    if (msg.properties.contentType === "application/json") {
      content = JSON.parse(content);
    }
    return content;
  }

  /**
   * deprecated, use 'queue.send(message: Message)' instead
   */
  publish(content: any, options: any = {}): void {
    // inline function to send the message
    var sendMessage = () => {
      try {
        this._channel.sendToQueue(this._name, content, options);
      } catch (err) {
        log.log("debug", "Queue publish error: " + err.message, { module: "amqp-ts" });
        var queueName = this._name;
        var connection = this._connection;
        log.log("debug", "Try to rebuild connection, before Call.", { module: "amqp-ts" });
        connection._rebuildAll(err).then(() => {
          log.log("debug", "Retransmitting message.", { module: "amqp-ts" });
          connection._queues[queueName].publish(content, options);
        });
      }
    };

    content = Queue._packMessageContent(content, options);
    // execute sync when possible
    if (this.initialized.isFulfilled()) {
      sendMessage();
    } else {
      this.initialized.then(sendMessage);
    }
  }

  send(message: Message, routingKey = ""): void {
    message.sendTo(this, routingKey);
  }

  rpc(requestParameters: any): Promise<Message> {
    return new Promise<Message>((resolve, reject) => {
      var processRpc = () => {
        var consumerTag: string;
        this._channel.consume(DIRECT_REPLY_TO_QUEUE, (resultMsg) => {
          this._channel.cancel(consumerTag);
          var result = new Message(resultMsg.content, resultMsg.fields);
          result.fields = resultMsg.fields;
          resolve(result);
        }, { noAck: true }, (err, ok) => {
          /* istanbul ignore if */
          if (err) {
            reject(new Error("amqp-ts: Queue.rpc error: " + err.message));
          } else {
            // send the rpc request
            consumerTag = ok.consumerTag;
            var message = new Message(requestParameters, { replyTo: DIRECT_REPLY_TO_QUEUE });
            message.sendTo(this);
          }
        });
      };

      // execute sync when possible
      if (this.initialized.isFulfilled()) {
        processRpc();
      } else {
        this.initialized.then(processRpc);
      }
    });
  }

  prefetch(count: number): void {
    this.initialized.then(() => {
      this._channel.prefetch(count);
      this._options.prefetch = count;
    });
  }

  recover(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.initialized.then(() => {
        this._channel.recover((err, ok) => {
          if (err) {
            reject(err);
          } else {
            resolve(null);
          }
        });
      });
    });
  }

  /**
   * deprecated, use 'queue.activateConsumer(...)' instead
   */
  startConsumer(onMessage: (msg: any, channel?: AmqpLib.Channel) => any,
    options: Queue.StartConsumerOptions = {})
    : Promise<Queue.StartConsumerResult> {
    if (this._consumerInitialized) {
      return new Promise<Queue.StartConsumerResult>((_, reject) => {
        reject(new Error("amqp-ts Queue.startConsumer error: consumer already defined"));
      });
    }

    this._isStartConsumer = true;
    this._rawConsumer = (options.rawMessage === true);
    delete options.rawMessage; // remove to avoid possible problems with amqplib
    this._consumerOptions = options;
    this._consumer = onMessage;
    this._initializeConsumer();

    return this._consumerInitialized;
  }

  activateConsumer(onMessage: (msg: Message) => any,
    options: Queue.ActivateConsumerOptions = {})
    : Promise<Queue.StartConsumerResult> {
    if (this._consumerInitialized) {
      return new Promise<Queue.StartConsumerResult>((_, reject) => {
        reject(new Error("amqp-ts Queue.activateConsumer error: consumer already defined"));
      });
    }

    this._consumerOptions = options;
    this._consumer = onMessage;
    this._initializeConsumer();

    return this._consumerInitialized;
  }

  _initializeConsumer(): void {
    var processedMsgConsumer = (msg: AmqpLib.Message) => {
      try {
        /* istanbul ignore if */
        if (!msg) {
          return; // ignore empty messages (for now)
        }
        var payload = Queue._unpackMessageContent(msg);
        var result = this._consumer(payload);
        // check if there is a reply-to
        if (msg.properties.replyTo) {
          var options: any = {};
          if (result instanceof Promise) {
            result.then((resultValue) => {
              resultValue = Queue._packMessageContent(result, options);
              this._channel.sendToQueue(msg.properties.replyTo, resultValue, options);
            }).catch((err) => {
              log.log("error", "Queue.onMessage RPC promise returned error: " + err.message, { module: "amqp-ts" });
            });
          } else {
            result = Queue._packMessageContent(result, options);
            this._channel.sendToQueue(msg.properties.replyTo, result, options);
          }
        }

        if (this._consumerOptions.noAck !== true) {
          this._channel.ack(msg);
        }
      } catch (err) {
        /* istanbul ignore next */
        log.log("error", "Queue.onMessage consumer function returned error: " + err.message, { module: "amqp-ts" });
      }
    };

    var rawMsgConsumer = (msg: AmqpLib.Message) => {
      try {
        this._consumer(msg, this._channel);
      } catch (err) {
        /* istanbul ignore next */
        log.log("error", "Queue.onMessage consumer function returned error: " + err.message, { module: "amqp-ts" });
      }
    };

    var activateConsumerWrapper = (msg: AmqpLib.Message) => {
      try {
        var message = new Message(msg.content, msg.properties);
        message.fields = msg.fields;
        message._message = msg;
        message._channel = this._channel;
        var result = this._consumer(message);
        // check if there is a reply-to
        if (msg.properties.replyTo) {
          if (result instanceof Promise) {
            result.then((resultValue) => {
              if (!(resultValue instanceof Message)) {
                resultValue = new Message(resultValue, {});
              }
              this._channel.sendToQueue(msg.properties.replyTo, resultValue.content, resultValue.properties);
            }).catch((err) => {
              log.log("error", "Queue.onMessage RPC promise returned error: " + err.message, { module: "amqp-ts" });
            });
          } else {
            if (!(result instanceof Message)) {
              result = new Message(result, {});
            }
            this._channel.sendToQueue(msg.properties.replyTo, result.content, result.properties);
          }
        }
      } catch (err) {
        /* istanbul ignore next */
        log.log("error", "Queue.onMessage consumer function returned error: " + err.message, { module: "amqp-ts" });
      }
    };

    this._consumerInitialized = new Promise<Queue.StartConsumerResult>((resolve, reject) => {
      this.initialized.then(() => {
        var consumerFunction = activateConsumerWrapper;
        if (this._isStartConsumer) {
          consumerFunction = this._rawConsumer ? rawMsgConsumer : processedMsgConsumer;
        }
        this._channel.consume(this._name, consumerFunction, <AmqpLib.Options.Consume>this._consumerOptions, (err, ok) => {
          /* istanbul ignore if */
          if (err) {
            reject(err);
          } else {
            this._consumerTag = ok.consumerTag;
            resolve(ok);
          }
        });
      });
    });
  }

  stopConsumer(): Promise<void> {
    if (!this._consumerInitialized || this._consumerStopping) {
      return Promise.resolve();
    }
    this._consumerStopping = true;
    return new Promise<void>((resolve, reject) => {
      this._consumerInitialized.then(() => {
        this._channel.cancel(this._consumerTag, (err, ok) => {
          /* istanbul ignore if */
          if (err) {
            reject(err);
          } else {
            delete this._consumerInitialized;
            delete this._consumer;
            delete this._consumerOptions;
            delete this._consumerStopping;
            resolve(null);
          }
        });
      });
    });
  }

  delete(): Promise<Queue.DeleteResult> {
    if (this._deleting === undefined) {
      this._deleting = new Promise<Queue.DeleteResult>((resolve, reject) => {
        this.initialized.then(() => {
          return Binding.removeBindingsContaining(this);
        }).then(() => {
          return this.stopConsumer();
        }).then(() => {
          return this._channel.deleteQueue(this._name, {}, (err, ok) => {
            /* istanbul ignore if */
            if (err) {
              reject(err);
            } else {
              delete this.initialized; // invalidate queue
              delete this._connection._queues[this._name]; // remove the queue from our administration
              this._channel.close((err) => {
                /* istanbul ignore if */
                if (err) {
                  reject(err);
                } else {
                  delete this._channel;
                  delete this._connection;
                  resolve(<Queue.DeleteResult>ok);
                }
              });
            }
          });
        }).catch((err) => {
          reject(err);
        });
      });
    }
    return this._deleting;
  }

  close(): Promise<void> {
    if (this._closing === undefined) {
      this._closing = new Promise<void>((resolve, reject) => {
        this.initialized.then(() => {
          return Binding.removeBindingsContaining(this);
        }).then(() => {
          return this.stopConsumer();
        }).then(() => {
          delete this.initialized; // invalidate queue
          delete this._connection._queues[this._name]; // remove the queue from our administration
          this._channel.close((err) => {
            /* istanbul ignore if */
            if (err) {
              reject(err);
            } else {
              delete this._channel;
              delete this._connection;
              resolve(null);
            }
          });
        }).catch((err) => {
          reject(err);
        });
      });
    }
    return this._closing;
  }

  bind(source: Exchange, pattern = "", args: any = {}): Promise<Binding> {
    var binding = new Binding(this, source, pattern, args);
    return binding.initialized;
  }

  unbind(source: Exchange, pattern = "", args: any = {}): Promise<void> {
    return this._connection._bindings[Binding.id(this, source, pattern)].delete();
  }
}
export namespace Queue {
  "use strict";
  export interface DeclarationOptions {
    exclusive?: boolean;
    durable?: boolean;
    autoDelete?: boolean;
    arguments?: any;
    messageTtl?: number;
    expires?: number;
    deadLetterExchange?: string;
    maxLength?: number;
    prefetch?: number;
    noCreate?: boolean;
  }
  export interface StartConsumerOptions {
    rawMessage?: boolean;
    consumerTag?: string;
    noLocal?: boolean;
    noAck?: boolean;
    exclusive?: boolean;
    priority?: number;
    arguments?: Object;
  }
  export interface ActivateConsumerOptions {
    consumerTag?: string;
    noLocal?: boolean;
    noAck?: boolean;
    exclusive?: boolean;
    priority?: number;
    arguments?: Object;
  }
  export interface StartConsumerResult {
    consumerTag: string;
  }
  export interface InitializeResult {
    queue: string;
    messageCount: number;
    consumerCount: number;
  }
  export interface DeleteResult {
    messageCount: number;
  }
}


//----------------------------------------------------------------------------------------------------
// Binding class
//----------------------------------------------------------------------------------------------------
export class Binding {
  initialized: Promise<Binding>;

  _source: Exchange;
  _destination: Exchange | Queue;
  _pattern: string;
  _args: any;

  constructor(destination: Exchange | Queue, source: Exchange, pattern = "", args: any = {}) {
    this._source = source;
    this._destination = destination;
    this._pattern = pattern;
    this._args = args;
    this._destination._connection._bindings[Binding.id(this._destination, this._source, this._pattern)] = this;
    this._initialize();
  }

  _initialize(): void {
    this.initialized = new Promise<Binding>((resolve, reject) => {
      if (this._destination instanceof Queue) {
        var queue = <Queue>this._destination;
        queue.initialized.then(() => {
          queue._channel.bindQueue(this._destination._name, this._source._name, this._pattern, this._args, (err, ok) => {
            /* istanbul ignore if */
            if (err) {
              log.log("error",
                "Failed to create queue binding (" +
                this._source._name + "->" + this._destination._name + ")",
                { module: "amqp-ts" });
              delete this._destination._connection._bindings[Binding.id(this._destination, this._source, this._pattern)];
              reject(err);
            } else {
              resolve(this);
            }
          });
        });
      } else {
        var exchange = <Exchange>this._destination;
        exchange.initialized.then(() => {
          exchange._channel.bindExchange(this._destination._name, this._source._name, this._pattern, this._args, (err, ok) => {
            /* istanbul ignore if */
            if (err) {
              log.log("error",
                "Failed to create exchange binding (" +
                this._source._name + "->" + this._destination._name + ")",
                { module: "amqp-ts" });
              delete this._destination._connection._bindings[Binding.id(this._destination, this._source, this._pattern)];
              reject(err);
            } else {
              resolve(this);
            }
          });
        });
      }
    });
  }

  delete(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this._destination instanceof Queue) {
        var queue = <Queue>this._destination;
        queue.initialized.then(() => {
          queue._channel.unbindQueue(this._destination._name, this._source._name, this._pattern, this._args, (err, ok) => {
            /* istanbul ignore if */
            if (err) {
              reject(err);
            } else {
              delete this._destination._connection._bindings[Binding.id(this._destination, this._source, this._pattern)];
              resolve(null);
            }
          });
        });
      } else {
        var exchange = <Exchange>this._destination;
        exchange.initialized.then(() => {
          exchange._channel.unbindExchange(this._destination._name, this._source._name, this._pattern, this._args, (err, ok) => {
            /* istanbul ignore if */
            if (err) {
              reject(err);
            } else {
              delete this._destination._connection._bindings[Binding.id(this._destination, this._source, this._pattern)];
              resolve(null);
            }
          });
        });
      };
    });
  }

  static id(destination: Exchange | Queue, source: Exchange, pattern?: string): string {
    pattern = pattern || "";
    return "[" + source._name + "]to" + (destination instanceof Queue ? "Queue" : "Exchange") + "[" + destination._name + "]" + pattern;
  }

  static removeBindingsContaining(connectionPoint: Exchange | Queue): Promise<any> {
    var connection = connectionPoint._connection;
    var promises: Promise<void>[] = [];
    for (var bindingId in connection._bindings) {

      var binding: Binding = connection._bindings[bindingId];
      if (binding._source === connectionPoint || binding._destination === connectionPoint) {
        promises.push(binding.delete());
      }
    }
    return Promise.all(promises);
  }
}
