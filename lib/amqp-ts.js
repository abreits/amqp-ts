/**
 * AmqpSimple.ts - provides a simple interface to read from and write to RabbitMQ amqp exchanges
 * Created by Ab on 17-9-2015.
 *
 * methods and properties starting with '_' signify that the scope of the item should be limited to
 * the inside of the enclosing namespace.
 */
// simplified use of amqp exchanges and queues, wrapper for amqplib
var Amqp = require("amqplib/callback_api");
var Promise = require("bluebird");
var winston = require("winston");
var path = require("path");
var os = require("os");
var ApplicationName = process.env.AMQPSIMPLE_APPLICATIONNAME || path.parse(process.argv[1]).name;
var AmqpSimple;
(function (AmqpSimple) {
    "use strict";
    var Connection = (function () {
        function Connection(url, socketOptions, reconnectStrategy) {
            this._rebuilding = false;
            this._exchanges = {};
            this._queues = {};
            this._bindings = {};
            this.url = url || "amqp://localhost";
            this.socketOptions = socketOptions || {};
            this.reconnectStrategy = reconnectStrategy || { retries: 0, interval: 1500 };
            this.rebuildConnection();
        }
        Connection.prototype.rebuildConnection = function () {
            var _this = this;
            if (this._rebuilding) {
                winston.log("debug", "Connection rebuild already in progress, join the rebuild attempt.");
                return this.initialized;
            }
            this._rebuilding = true;
            if (this._connection) {
                process.removeListener("SIGINT", this._connection.close);
            }
            // rebuild the connection
            this.initialized = new Promise(function (resolve, reject) {
                _this.tryToConnect(_this, 0, function (err) {
                    /* istanbul ignore if */
                    if (err) {
                        _this._rebuilding = false;
                        reject(err);
                    }
                    else {
                        _this._rebuilding = false;
                        resolve(null);
                    }
                });
            });
            /* istanbul ignore next */
            this.initialized.catch(function (err) {
                winston.log("warn", "Error creating connection!");
                throw (err);
            });
            // TODO: rebuild the configuration
            return this.initialized;
        };
        Connection.prototype.tryToConnect = function (thisConnection, retry, callback) {
            Amqp.connect(thisConnection.url, thisConnection.socketOptions, function (err, connection) {
                /* istanbul ignore if */
                if (err) {
                    winston.log("warn", "AMQP connection failed");
                    if (thisConnection.reconnectStrategy.retries === 0 || thisConnection.reconnectStrategy.retries > retry) {
                        winston.log("warn", "Connection retry " + (retry + 1) + " in " + thisConnection.reconnectStrategy.interval + "ms");
                        setTimeout(thisConnection.tryToConnect, thisConnection.reconnectStrategy.interval, thisConnection, retry + 1, callback);
                    }
                    else {
                        winston.log("warn", "AMQP connection failed, exiting: No connection retries left (retry " + retry + ")");
                        callback(err);
                    }
                }
                else {
                    winston.log("info", "AMQP connection succeeded");
                    process.once("SIGINT", connection.close); //close the connection when the program is interrupted
                    /* istanbul ignore next */
                    connection.once("error", function (err) {
                        winston.log("debug", "CONNECTION ERROR OCCURRED!!!");
                        thisConnection._rebuildAll(err); //try to rebuild the topology when the connection  unexpectedly closes
                    });
                    thisConnection._connection = connection;
                    callback(null);
                }
            });
        };
        Connection.prototype._rebuildAll = function (err) {
            var _this = this;
            winston.log("warn", "AMQP connection error: " + err.message);
            winston.log("debug", "rebuilding connection NOW");
            this.rebuildConnection();
            // re initialize configuration
            //re initialize exchanges, queues and bindings if they exist
            for (var exchangeId in this._exchanges) {
                var exchange = this._exchanges[exchangeId];
                winston.log("debug", "Re initialize Exchange " + exchange._name);
                exchange._initialize();
            }
            for (var queueId in this._queues) {
                var queue = this._queues[queueId];
                var consumer = queue._consumer;
                var consumerOptions = queue._consumerOptions;
                winston.log("debug", "Re initialize queue " + queue._name);
                queue._initialize();
                if (consumer) {
                    winston.log("debug", "Re initialize consumer for queue " + queue._name);
                    queue._initializeConsumer();
                }
            }
            for (var bindingId in this._bindings) {
                var binding = this._bindings[bindingId];
                winston.log("debug", "Re initialize binding from " + binding._source._name + " to " + binding._destination._name);
                binding._initialize();
            }
            return new Promise(function (resolve, reject) {
                _this.completeConfiguration().then(function () {
                    winston.log("debug", "Rebuild success");
                    resolve(null);
                }, /* istanbul ignore next */ function (rejectReason) {
                    winston.log("debug", "Rebuild failed");
                    reject(rejectReason);
                });
            });
        };
        Connection.prototype.close = function () {
            var _this = this;
            return new Promise(function (resolve, reject) {
                _this.initialized.then(function () {
                    _this._connection.close(function (err) {
                        /* istanbul ignore if */
                        if (err) {
                            reject(err);
                        }
                        else {
                            process.removeListener("SIGINT", _this._connection.close);
                            resolve(null);
                        }
                    });
                });
            });
        };
        /**
         * Make sure the whole defined connection topology is configured:
         * return promise that fulfills after all defined exchanges, queues and bindings are initialized
         */
        Connection.prototype.completeConfiguration = function () {
            var promises = [];
            for (var exchangeId in this._exchanges) {
                var exchange = this._exchanges[exchangeId];
                promises.push(exchange.initialized);
            }
            for (var queueId in this._queues) {
                var queue = this._queues[queueId];
                promises.push(queue.initialized);
                if (queue._consumerInitialized) {
                    promises.push(queue._consumerInitialized);
                }
            }
            for (var bindingId in this._bindings) {
                var binding = this._bindings[bindingId];
                promises.push(binding.initialized);
            }
            return Promise.all(promises);
        };
        /**
         * Delete the whole defined connection topology:
         * return promise that fulfills after all defined exchanges, queues and bindings have been removed
         */
        Connection.prototype.deleteConfiguration = function () {
            var promises = [];
            for (var bindingId in this._bindings) {
                var binding = this._bindings[bindingId];
                promises.push(binding.delete());
            }
            for (var queueId in this._queues) {
                var queue = this._queues[queueId];
                if (queue._consumerInitialized) {
                    promises.push(queue.stopConsumer());
                }
                promises.push(queue.delete());
            }
            for (var exchangeId in this._exchanges) {
                var exchange = this._exchanges[exchangeId];
                promises.push(exchange.delete());
            }
            return Promise.all(promises);
        };
        Connection.prototype.declareExchange = function (name, type, options) {
            return new Exchange(this, name, type, options);
        };
        Connection.prototype.declareQueue = function (name, options) {
            return new Queue(this, name, options);
        };
        return Connection;
    })();
    AmqpSimple.Connection = Connection;
    var Exchange = (function () {
        function Exchange(connection, name, type, options) {
            this._connection = connection;
            this._name = name;
            this._type = type;
            this._options = options;
            this._initialize();
        }
        Exchange.prototype._initialize = function () {
            var _this = this;
            this.initialized = new Promise(function (resolve, reject) {
                _this._connection.initialized.then(function () {
                    _this._connection._connection.createChannel(function (err, channel) {
                        /* istanbul ignore if */
                        if (err) {
                            reject(err);
                        }
                        else {
                            _this._channel = channel;
                            _this._channel.assertExchange(_this._name, _this._type, _this._options, function (err, ok) {
                                /* istanbul ignore if */
                                if (err) {
                                    console.log("Failed to create exchange " + _this._name);
                                    delete _this._connection._exchanges[_this._name];
                                    reject(err);
                                }
                                else {
                                    resolve(_this);
                                }
                            });
                        }
                    });
                });
            });
            this._connection._exchanges[this._name] = this;
        };
        Exchange.prototype.publish = function (content, routingKey, options) {
            var _this = this;
            if (typeof content === "string") {
                content = new Buffer(content);
            }
            else if (!(content instanceof Buffer)) {
                content = new Buffer(JSON.stringify(content));
                options = options || {};
                options.contentType = options.contentType || "application/json";
            }
            routingKey = routingKey || "";
            this.initialized.then(function () {
                try {
                    _this._channel.publish(_this._name, routingKey, content, options);
                }
                catch (err) {
                    winston.log("warn", "AMQP Exchange publish error: " + err.message);
                    var exchangeName = _this._name;
                    var connection = _this._connection;
                    connection._rebuildAll(err).then(function () {
                        winston.log("debug", "retransmitting message");
                        connection._exchanges[exchangeName].publish(content, options);
                    });
                }
            });
        };
        Exchange.prototype.delete = function () {
            var _this = this;
            return new Promise(function (resolve, reject) {
                _this.initialized.then(function () {
                    return Binding.removeBindingsContaining(_this);
                }).then(function () {
                    _this._channel.deleteExchange(_this._name, {}, function (err, ok) {
                        /* istanbul ignore if */
                        if (err) {
                            reject(err);
                        }
                        else {
                            delete _this.initialized; // invalidate exchange
                            delete _this._channel;
                            delete _this._connection._exchanges[_this._name]; // remove the exchange from our administration
                            delete _this._connection;
                            resolve(null);
                        }
                    });
                });
            });
        };
        Exchange.prototype.bind = function (source, pattern, args) {
            var binding = new Binding(this, source, pattern, args);
            return binding.initialized;
        };
        Exchange.prototype.unbind = function (source, pattern, args) {
            return this._connection._bindings[Binding.id(this, source, pattern)].delete();
        };
        Exchange.prototype.consumerQueueName = function () {
            return this._name + "." + ApplicationName + "." + os.hostname() + "." + process.pid;
        };
        Exchange.prototype.startConsumer = function (onMessage, options) {
            var queueName = this.consumerQueueName();
            if (this._connection._queues[queueName]) {
                return new Promise(function (_, reject) {
                    reject(new Error("AMQP Exchange.startConsumer error: consumer already defined"));
                });
            }
            else {
                var promises = [];
                var queue = new Queue(this._connection, queueName, { durable: false });
                promises.push(queue.initialized);
                var binding = queue.bind(this);
                promises.push(binding);
                var consumer = queue.startConsumer(onMessage, options);
                promises.push(consumer);
                return Promise.all(promises);
            }
        };
        Exchange.prototype.stopConsumer = function () {
            var queue = this._connection._queues[this.consumerQueueName()];
            if (queue) {
                var binding = this._connection._bindings[Binding.id(queue, this)];
                var promises = [];
                promises.push(queue.stopConsumer());
                promises.push(binding.delete());
                promises.push(queue.delete());
                return Promise.all(promises);
            }
            else {
                return new Promise(function (_, reject) {
                    reject(new Error("AMQP Exchange.cancelConsumer error: no consumer defined"));
                });
            }
        };
        return Exchange;
    })();
    AmqpSimple.Exchange = Exchange;
    var Queue = (function () {
        function Queue(connection, name, options) {
            this._connection = connection;
            this._name = name;
            this._options = options;
            this._connection._queues[this._name] = this;
            this._initialize();
        }
        Queue.prototype._initialize = function () {
            var _this = this;
            this.initialized = new Promise(function (resolve, reject) {
                _this._connection.initialized.then(function () {
                    _this._connection._connection.createChannel(function (err, channel) {
                        /* istanbul ignore if */
                        if (err) {
                            reject(err);
                        }
                        else {
                            _this._channel = channel;
                            _this._channel.assertQueue(_this._name, _this._options, function (err, ok) {
                                /* istanbul ignore if */
                                if (err) {
                                    winston.log("error", "Failed to create queue " + _this._name);
                                    delete _this._connection._queues[_this._name];
                                    reject(err);
                                }
                                else {
                                    resolve(_this);
                                }
                            });
                        }
                    });
                });
            });
        };
        Queue.prototype.publish = function (content, options) {
            var _this = this;
            // inline function to send the message
            var sendMessage = function () {
                try {
                    _this._channel.sendToQueue(_this._name, content, options);
                }
                catch (err) {
                    console.log("AMQP Exchange publish error: " + err.message);
                    var queueName = _this._name;
                    var connection = _this._connection;
                    console.log("Try to rebuild connection, before Call");
                    connection._rebuildAll(err).then(function () {
                        console.log("retransmitting message");
                        connection._queues[queueName].publish(content, options);
                    });
                }
            };
            if (typeof content === "string") {
                content = new Buffer(content);
            }
            else if (!(content instanceof Buffer)) {
                content = new Buffer(JSON.stringify(content));
                options = options || {};
                options.contentType = "application/json";
            }
            // execute sync when possible
            if (this.initialized.isFulfilled()) {
                sendMessage();
            }
            else {
                this.initialized.then(sendMessage);
            }
        };
        Queue.prototype.startConsumer = function (onMessage, options) {
            if (this._consumerInitialized) {
                return new Promise(function (_, reject) {
                    reject(new Error("AMQP Queue.startConsumer error: consumer already defined"));
                });
            }
            this._consumerOptions = options;
            this._consumer = onMessage;
            this._initializeConsumer();
            return this._consumerInitialized;
        };
        Queue.prototype._initializeConsumer = function () {
            var _this = this;
            var consumerFunction = function (msg) {
                if (!msg) {
                    return; // ignore empty messages (for now)
                }
                var payload = msg.content.toString();
                if (msg.properties.contentType === "application/json") {
                    payload = JSON.parse(payload);
                }
                _this._consumer(payload);
                _this._channel.ack(msg);
            };
            this._consumerInitialized = new Promise(function (resolve, reject) {
                _this.initialized.then(function () {
                    _this._channel.consume(_this._name, consumerFunction, _this._options, function (err, ok) {
                        /* istanbul ignore if */
                        if (err) {
                            reject(err);
                        }
                        else {
                            _this._consumerTag = ok.consumerTag;
                            resolve(ok);
                        }
                    });
                });
            });
        };
        Queue.prototype.stopConsumer = function () {
            var _this = this;
            if (!this._consumerInitialized) {
                return new Promise(function (resolve, reject) {
                    reject(new Error("AMQP Queue.cancelConsumer error: no consumer defined"));
                });
            }
            return new Promise(function (resolve, reject) {
                _this._consumerInitialized.then(function () {
                    _this._channel.cancel(_this._consumerTag, function (err, ok) {
                        /* istanbul ignore if */
                        if (err) {
                            reject(err);
                        }
                        else {
                            delete _this._consumerInitialized;
                            delete _this._consumer;
                            delete _this._consumerOptions;
                            resolve(null);
                        }
                    });
                });
            });
        };
        Queue.prototype.delete = function () {
            var _this = this;
            return new Promise(function (resolve, reject) {
                _this.initialized.then(function () {
                    return Binding.removeBindingsContaining(_this);
                }).then(function () {
                    _this._channel.deleteQueue(_this._name, {}, function (err, ok) {
                        /* istanbul ignore if */
                        if (err) {
                            reject(err);
                        }
                        else {
                            delete _this.initialized; // invalidate queue
                            delete _this._channel;
                            delete _this._connection._queues[_this._name]; // remove the queue from our administration
                            delete _this._connection;
                            resolve(ok);
                        }
                    });
                });
            });
        };
        Queue.prototype.bind = function (source, pattern, args) {
            var binding = new Binding(this, source, pattern, args);
            return binding.initialized;
        };
        Queue.prototype.unbind = function (source, pattern, args) {
            return this._connection._bindings[Binding.id(this, source, pattern)].delete();
        };
        return Queue;
    })();
    AmqpSimple.Queue = Queue;
    //----------------------------------------------------------------------------------------------------
    // Binding class
    //----------------------------------------------------------------------------------------------------
    var Binding = (function () {
        function Binding(destination, source, pattern, args) {
            pattern = pattern || "";
            args = args || {};
            this._source = source;
            this._destination = destination;
            this._pattern = pattern;
            this._args = args;
            this._destination._connection._bindings[Binding.id(this._destination, this._source, this._pattern)] = this;
            this._initialize();
        }
        Binding.prototype._initialize = function () {
            var _this = this;
            this.initialized = new Promise(function (resolve, reject) {
                var promise = _this._destination.initialized;
                if (_this._destination instanceof Queue) {
                    winston.log("debug", "create binding " + Binding.id(_this._destination, _this._source, _this._pattern));
                    var queue = _this._destination;
                    queue.initialized.then(function () {
                        queue._channel.bindQueue(_this._destination._name, _this._source._name, _this._pattern, _this._args, function (err, ok) {
                            /* istanbul ignore if */
                            if (err) {
                                winston.log("error", "Failed to create queue binding");
                                delete _this._destination._connection._bindings[Binding.id(_this._destination, _this._source, _this._pattern)];
                                reject(err);
                            }
                            else {
                                resolve(_this);
                            }
                        });
                    });
                }
                else {
                    winston.log("debug", "create binding " + Binding.id(_this._destination, _this._source, _this._pattern));
                    var exchange = _this._destination;
                    exchange.initialized.then(function () {
                        exchange._channel.bindExchange(_this._destination._name, _this._source._name, _this._pattern, _this._args, function (err, ok) {
                            /* istanbul ignore if */
                            if (err) {
                                winston.log("error", "Failed to create exchange binding");
                                delete _this._destination._connection._bindings[Binding.id(_this._destination, _this._source, _this._pattern)];
                                reject(err);
                            }
                            else {
                                resolve(_this);
                            }
                        });
                    });
                }
            });
        };
        Binding.prototype.delete = function () {
            var _this = this;
            return new Promise(function (resolve, reject) {
                if (_this._destination instanceof Queue) {
                    var queue = _this._destination;
                    queue.initialized.then(function () {
                        queue._channel.unbindQueue(_this._destination._name, _this._source._name, _this._pattern, _this._args, function (err, ok) {
                            /* istanbul ignore if */
                            if (err) {
                                reject(err);
                            }
                            else {
                                delete _this._destination._connection._bindings[Binding.id(_this._destination, _this._source, _this._pattern)];
                                resolve(null);
                            }
                        });
                    });
                }
                else {
                    var exchange = _this._destination;
                    exchange.initialized.then(function () {
                        exchange._channel.unbindExchange(_this._destination._name, _this._source._name, _this._pattern, _this._args, function (err, ok) {
                            /* istanbul ignore if */
                            if (err) {
                                reject(err);
                            }
                            else {
                                delete _this._destination._connection._bindings[Binding.id(_this._destination, _this._source, _this._pattern)];
                                resolve(null);
                            }
                        });
                    });
                }
                ;
            });
        };
        Binding.id = function (destination, source, pattern) {
            pattern = pattern || "";
            return "[" + source._name + "]to" + (destination instanceof Queue ? "Queue" : "Exchange") + "[" + destination._name + "]" + pattern;
        };
        Binding.removeBindingsContaining = function (connectionPoint) {
            var connection = connectionPoint._connection;
            var promises = [];
            for (var bindingId in connection._bindings) {
                var binding = connection._bindings[bindingId];
                if (binding._source === connectionPoint || binding._destination === connectionPoint) {
                    promises.push(binding.delete());
                }
            }
            return Promise.all(promises);
        };
        return Binding;
    })();
    AmqpSimple.Binding = Binding;
})(AmqpSimple = exports.AmqpSimple || (exports.AmqpSimple = {}));

//# sourceMappingURL=AmqpSimple.js.map
