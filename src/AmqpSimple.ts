/**
 * AmqpSimple.ts - provides a simple interface to read from and write to RabbitMQ amqp exchanges
 * Created by Ab on 17-9-2015.
 *
 * methods and properties starting with '_' signify that the scope of the item should be limited to
 * the inside of the enclosing namespace.
 */

/// <reference path="../typings_custom/amqplib_callback/amqplib_callback.d.ts" />

// simplified use of amqp exchanges and queues, wrapper for amqplib

import * as Amqp from "amqplib/callback_api";
import * as Promise from "bluebird";
import * as winston from "winston";
import * as path from "path";
import * as os from "os";

var ApplicationName = process.env.AMQPSIMPLE_APPLICATIONNAME || path.parse(process.argv[1]).name;

export namespace AmqpSimple {
  "use strict";

  export namespace Connection {
    export interface ReconnectStrategy {
        retries: number; // number of retries, 0 is forever
        interval: number; // retry interval in ms
    }
  }

  export class Connection {
    initialized: Promise<void>;

    private url: string;
    private socketOptions: any;
    private reconnectStrategy: Connection.ReconnectStrategy;

    _connection: Amqp.Connection;

    _exchanges: {[id: string] : Exchange};
    _queues: {[id: string] : Queue};
    _bindings: {[id: string] : Binding};

    constructor (url?: string, socketOptions?: any, reconnectStrategy?: Connection.ReconnectStrategy) {
      this._exchanges = {};
      this._queues = {};
      this._bindings = {};

      this.url = url || "amqp://localhost";
      this.socketOptions = socketOptions || {};
      this.reconnectStrategy = reconnectStrategy || {retries: 0, interval: 1500};
      this.rebuildConnection();
    }

    private rebuildConnection(): Promise<void> {
      if (this._connection) {
        process.removeListener("SIGINT", this._connection.close);
      }
      this.initialized = new Promise<void>((resolve, reject) => {
        this.tryToConnect(0, (err) => {
          /* istanbul ignore if */
          if (err) {
            reject(err);
          } else {
            resolve(null);
          }
        });
      });
      /* istanbul ignore next */
      this.initialized.catch((err) => {
        winston.log("warn", "Error creating connection!");
      });
      return this.initialized;
    }

    private tryToConnect(retry: number, callback: (err: any) => void) {
      Amqp.connect(this.url, this.socketOptions, (err, connection) => {
        /* istanbul ignore if */
        if (err) {
          winston.log("warn" , "AMQP connection failed");
          if (this.reconnectStrategy && (this.reconnectStrategy.retries === 0 || this.reconnectStrategy.retries > retry)) {
            setTimeout(this.tryToConnect, this.reconnectStrategy.interval, retry + 1, callback);
          } else { //no reconnect strategy, or retries exhausted, so return the error
            callback(err);
          }
        } else {
          winston.log("debug", "AMQP connection succeeded");
          process.once("SIGINT", connection.close); //close the connection when the program is interrupted
          /* istanbul ignore next */
          connection.on("error", (err) => {
            this._rebuildAll(err); //try to rebuild the topology when the connection  unexpectedly closes
          });
          this._connection = connection;

          callback(null);
        }
      });
    }

    _rebuildAll(err): Promise<void> {
      winston.log("warn", "AMQP connection error: " + err.message);

      return new Promise<void>((resolve, reject) => {
        winston.log("debug", "rebuilding connection NOW");
        this.rebuildConnection().then(() => {
          //rebuild exchanges, queues and bindings if they exist
          for (var exchangeId in this._exchanges) {
            var exchange = this._exchanges[exchangeId];
            winston.log("debug", "Rebuild Exchange " + exchange._name);
            exchange = new Exchange(this, exchange._name, exchange._type, exchange._options);
          }
          for (var queueId in this._queues) {
            var queue = this._queues[queueId];
            var consumer = queue._consumer;
            var consumerOptions = queue._consumerOptions;
            winston.log("debug", "Rebuild queue " + queue._name);
            queue = new Queue(this, queue._name, queue._options);
            if (consumer) {
              queue.startConsumer(consumer, consumerOptions);
            }
          }
          for (var bindingId in this._bindings) {
            var binding = this._bindings[bindingId];
            winston.log("debug", "Rebuild binding from " + binding._source._name + " to " + binding._destination._name);
            var source = this._exchanges[binding._source._name];
            var destination = (binding._destination instanceof Queue) ?
                                this._queues[binding._destination._name] :
                                this._exchanges[binding._destination._name];
            binding = new Binding(destination, source, binding._pattern, binding._args);
          }
          this.completeConfiguration().then(() => {
            winston.log("debug", "Rebuild success");
            resolve(null);
          }, /* istanbul ignore next */
          (rejectReason) => {
            winston.log("debug", "Rebuild failed");
            reject(rejectReason);
          });
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
                process.removeListener("SIGINT", this._connection.close);
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
      var promises = [];
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
      var promises = [];
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
      return new Exchange(this, name, type, options);
    }

    declareQueue(name: string, options?: Queue.DeclarationOptions): Queue {
      return new Queue(this, name, options);
    }
  }

//----------------------------------------------------------------------------------------------------
// Exchange class
//----------------------------------------------------------------------------------------------------
  export namespace Exchange {
    export interface DeclarationOptions {
            durable?: boolean;
            internal?: boolean;
            autoDelete?: boolean;
            alternateExchange?: string;
            arguments?: any;
    }
  }
  export class Exchange {
    initialized: Promise<Exchange>;

    _connection: Connection;
    _channel: Amqp.Channel;
    _name: string;
    _type: string;
    _options: Amqp.Options.AssertExchange;

    constructor (connection: Connection, name: string, type?: string, options?: Exchange.DeclarationOptions) {
      this._connection = connection;
      this._name = name;
      this._type = type;
      this._options = options;

      this.initialized = new Promise<Exchange>((resolve, reject) => {
        this._connection.initialized.then(() => {
          this._connection._connection.createChannel((err, channel) => {
            /* istanbul ignore if */
            if (err) {
              reject(err);
            } else {
              this._channel = channel;
              this._channel.assertExchange(name, type, <Amqp.Options.AssertExchange>options, (err, ok) => {
                /* istanbul ignore if */
                if (err) {
                  console.log("Failed to create exchange " + this._name);
                  delete this._connection._exchanges[this._name];
                  reject(err);
                } else {
                  resolve(this);
                }
              });
            }
          });
        });
      });
      this._connection._exchanges[this._name] = this;
    }

    publish(content: any, routingKey?: string, options?: any): void {
      if (typeof content === "string") {
        content = new Buffer(content);
      } else if (!(content instanceof Buffer)) {
        content = new Buffer(JSON.stringify(content));
        options = options || {};
        options.contentType = options.contentType || "application/json";
      }
      routingKey = routingKey || "";
      this.initialized.then(() => {
        try {
          this._channel.publish(this._name, routingKey, content, options);
        } catch (err) {
          winston.log("warn", "AMQP Exchange publish error: " + err.message);
          var exchangeName = this._name;
          var connection = this._connection;
          connection._rebuildAll(err).then(() => {
            winston.log("debug", "retransmitting message");
            connection._exchanges[exchangeName].publish(content, options);
          });
        }
      });
    }

    delete(): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        this.initialized.then(() => {
          return Binding.removeBindingsContaining(this);
        }).then(() => {
          this._channel.deleteExchange(this._name, {}, (err, ok) => {
            /* istanbul ignore if */
            if (err) {
              reject(err);
            } else {
              delete this.initialized; // invalidate exchange
              delete this._channel;
              delete this._connection._exchanges[this._name]; // remove the exchange from our administration
              delete this._connection;
              resolve(null);
            }
          });
        });
      });
    }

    bind(source: Exchange, pattern?: string, args?: any): Promise<Binding> {
      var binding = new Binding(this, source, pattern, args);
      return binding.initialized;
    }

    unbind(source: Exchange, pattern?: string, args?: any): Promise<void> {
      return this._connection._bindings[Binding.id(this, source)].delete();
    }

    consumerQueueName(): string {
      return this._name + "." + ApplicationName + "." + os.hostname() + "." + process.pid;
    }

    startConsumer(onMessage: (msg: any) => void, options?: Queue.StartConsumerOptions): Promise<any> {
      var queueName = this.consumerQueueName();
      if (this._connection._queues[queueName]) {
        return new Promise<void>((_, reject) => {
          reject(new Error("AMQP Exchange.startConsumer error: consumer already defined"));
        });
      } else {
        var promises = [];
        var queue = new Queue(this._connection, queueName, {durable: false});
        promises.push(queue.initialized);
        var binding = queue.bind(this);
        promises.push(binding);
        var consumer = queue.startConsumer(onMessage, options);
        promises.push(consumer);

        return Promise.all(promises);
      }
    }

    stopConsumer(): Promise<any> {
      var queue = this._connection._queues[this.consumerQueueName()];
      if (queue) {
        var binding = this._connection._bindings[Binding.id(queue, this)];
        var promises = [];
        promises.push(queue.stopConsumer());
        promises.push(binding.delete());
        promises.push(queue.delete());

        return Promise.all(promises);
      } else {
        return new Promise<void>((_, reject) => {
          reject(new Error("AMQP Exchange.cancelConsumer error: no consumer defined"));
        });
      }
    }
  }

//----------------------------------------------------------------------------------------------------
// Queue class
//----------------------------------------------------------------------------------------------------
  export namespace Queue {
    export interface DeclarationOptions {
      exclusive?: boolean;
      durable?: boolean;
      autoDelete?: boolean;
      arguments?: any;
      messageTtl?: number;
      expires?: number;
      deadLetterExchange?: string;
      maxLength?: number;
    }
    export interface StartConsumerOptions {
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
    export interface DeleteResult {
      messageCount: number;
    }
  }
  export class Queue {
    initialized: Promise<Queue>;

    _connection: Connection;
    _channel: Amqp.Channel;
    _name: string;
    _options: Queue.DeclarationOptions;

    _consumer: (msg: any) => void;
    _consumerOptions: Queue.StartConsumerOptions;
    _consumerTag: string;
    _consumerInitialized: Promise<Queue.StartConsumerResult>;

    constructor (connection: Connection, name: string, options?: Queue.DeclarationOptions) {
      this._connection = connection;
      this._name = name;
      this._options = options;
      this.initialized = new Promise<Queue>((resolve, reject) => {
        this._connection.initialized.then(() => {
          this._connection._connection.createChannel((err, channel) => {
            /* istanbul ignore if */
            if (err) {
              reject(err);
            } else {
              this._channel = channel;
              this._channel.assertQueue(name, <Amqp.Options.AssertQueue>options, (err, ok) => {
                /* istanbul ignore if */
                if (err) {
                  winston.log("error", "Failed to create queue " + this._name);
                  delete this._connection._queues[this._name];
                  reject(err);
                } else {
                  resolve(this);
                }
              });
            }
          });
        });
      });
      this._connection._queues[this._name] = this;
    }

    publish(content: any, options?: any) {
      // inline function to send the message
      var sendMessage = () => {
        try {
          this._channel.sendToQueue(this._name, content, options);
        } catch (err) {
          console.log("AMQP Exchange publish error: " + err.message);
          var queueName = this._name;
          var connection = this._connection;
          console.log("Try to rebuild connection, before Call");
          connection._rebuildAll(err).then(() => {
            console.log("retransmitting message");
            connection._queues[queueName].publish(content, options);
          });
        }
      };

      if (typeof content === "string") {
        content = new Buffer(content);
      } else if (!(content instanceof Buffer)) {
        content = new Buffer(JSON.stringify(content));
        options = options || {};
        options.contentType = "application/json";
      }
      // execute sync when possible
      if (this.initialized.isFulfilled()) {
        sendMessage();
      } else {
        this.initialized.then(sendMessage);
      }
    }

    startConsumer(onMessage: (msg: any) => void, options?: Queue.StartConsumerOptions): Promise<Queue.StartConsumerResult> {
      if (this._consumerInitialized) {
        return new Promise<Queue.StartConsumerResult>((_, reject) => {
          reject(new Error("AMQP Queue.startConsumer error: consumer already defined"));
        });
      }

      var consumerFunction = (msg: Amqp.Message) => {
        if (!msg) {
          return; // ignore empty messages (for now)
        }
        var payload = msg.content.toString();
        if (msg.properties.contentType === "application/json") {
          payload = JSON.parse(payload);
        }
        onMessage(payload);
        this._channel.ack(msg);
      };

      this._consumerOptions = options;
      this._consumer = onMessage;
      this._consumerInitialized = new Promise<Queue.StartConsumerResult>((resolve, reject) => {
        this.initialized.then(() => {
          this._channel.consume(this._name, consumerFunction, <Amqp.Options.Consume>options, (err, ok) => {
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
      return this._consumerInitialized;
    }

    stopConsumer(): Promise<void> {
      if (!this._consumerInitialized) {
        return new Promise<void>((resolve, reject) => {
          reject(new Error("AMQP Queue.cancelConsumer error: no consumer defined"));
        });
      }
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
              resolve(null);
            }
          });
        });
      });
    }

    delete(): Promise<Queue.DeleteResult> {
      return new Promise<Queue.DeleteResult>((resolve, reject) => {
        this.initialized.then(() => {
          return Binding.removeBindingsContaining(this);
        }).then(() => {
          this._channel.deleteQueue(this._name, {}, (err, ok) => {
            /* istanbul ignore if */
            if (err) {
              reject(err);
            } else {
              delete this.initialized; // invalidate queue
              delete this._channel;
              delete this._connection._queues[this._name]; // remove the queue from our administration
              delete this._connection;
              resolve(<Queue.DeleteResult>ok);
            }
          });
        });
      });
    }

    bind(source: Exchange, pattern?: string, args?: any): Promise<Binding> {
      var binding = new Binding(this, source, pattern, args);
      return binding.initialized;
    }

    unbind(source: Exchange, pattern?: string, args?: any): Promise<void> {
      return this._connection._bindings[Binding.id(this, source)].delete();
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

    constructor(destination: Exchange | Queue, source: Exchange, pattern?: string, args?: any) {
      pattern = pattern || "";
      args = args || {};
      this._source = source;
      this._destination = destination;
      this._pattern = pattern;
      this._args = args;

      this.initialized = new Promise<Binding>((resolve, reject) => {
        var promise = this._destination.initialized;
        if (this._destination instanceof Queue) {
          winston.log("debug", "create binding " + Binding.id(this._destination, this._source));
          var queue = <Queue>this._destination;
          queue.initialized.then(() => {
            queue._channel.bindQueue(this._destination._name, source._name, pattern, args, (err, ok) => {
              /* istanbul ignore if */
              if (err) {
                console.log("Failed to create binding");
                delete this._destination._connection._bindings[Binding.id(this._destination, this._source)];
                reject(err);
              } else {
                resolve(this);
              }
            });
          });
        } else {
          winston.log("debug", "create binding " + Binding.id(this._destination, this._source));
          var exchange = <Queue>this._destination;
          exchange.initialized.then(() => {
            exchange._channel.bindExchange(this._destination._name, source._name, pattern, args, (err, ok) => {
              /* istanbul ignore if */
              if (err) {
                delete this._destination._connection._bindings[Binding.id(this._destination, this._source)];
                reject(err);
              } else {
                resolve(this);
              }
            });
          });
        }
      });
      this._destination._connection._bindings[Binding.id(this._destination, this._source)] = this;
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
                delete this._destination._connection._bindings[Binding.id(this._destination, this._source)];
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
                delete this._destination._connection._bindings[Binding.id(this._destination, this._source)];
                resolve(null);
              }
            });
          });
        };
      });
    }

    static id(destination: Exchange | Queue, source: Exchange): string {
      return "[" + source._name + "]to" + (destination instanceof Queue ? "Queue" : "Exchange") + "[" + destination._name + "]";
    }

    static removeBindingsContaining(connectionPoint: Exchange | Queue): Promise<any> {
      var connection = connectionPoint._connection;
      var promises = [];
      for (var bindingId in connection._bindings) {

        var binding: Binding = connection._bindings[bindingId];
        if (binding._source === connectionPoint || binding._destination === connectionPoint) {
          promises.push(binding.delete());
        }
      }
      return Promise.all(promises);
    }
  }
}
