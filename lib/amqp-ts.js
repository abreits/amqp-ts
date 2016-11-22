/**
 * AmqpSimple.ts - provides a simple interface to read from and write to RabbitMQ amqp exchanges
 * Created by Ab on 17-9-2015.
 *
 * methods and properties starting with '_' signify that the scope of the item should be limited to
 * the inside of the enclosing namespace.
 */
"use strict";
// simplified use of amqp exchanges and queues, wrapper for amqplib
var AmqpLib = require("amqplib/callback_api");
var Promise = require("bluebird");
var winston = require("winston");
var path = require("path");
var os = require("os");
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
exports.log = amqp_log;
// name for the RabbitMQ direct reply-to queue
var DIRECT_REPLY_TO_QUEUE = "amq.rabbitmq.reply-to";
//----------------------------------------------------------------------------------------------------
// Connection class
//----------------------------------------------------------------------------------------------------
var Connection = (function () {
    function Connection(url, socketOptions, reconnectStrategy) {
        if (url === void 0) { url = "amqp://localhost"; }
        if (socketOptions === void 0) { socketOptions = {}; }
        if (reconnectStrategy === void 0) { reconnectStrategy = { retries: 0, interval: 1500 }; }
        this.connectedBefore = false;
        this._rebuilding = false;
        this.url = url;
        this.socketOptions = socketOptions;
        this.reconnectStrategy = reconnectStrategy;
        this._exchanges = {};
        this._queues = {};
        this._bindings = {};
        this.rebuildConnection();
    }
    Connection.prototype.rebuildConnection = function () {
        var _this = this;
        if (this._rebuilding) {
            exports.log.log("debug", "Connection rebuild already in progress, joining active rebuild attempt.", { module: "amqp-ts" });
            return this.initialized;
        }
        this._retry = -1;
        this._rebuilding = true;
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
                    if (_this.connectedBefore) {
                        exports.log.log("warn", "Connection re-established", { module: "amqp-ts" });
                    }
                    else {
                        exports.log.log("info", "Connection established.", { module: "amqp-ts" });
                        _this.connectedBefore = true;
                    }
                    resolve(null);
                }
            });
        });
        /* istanbul ignore next */
        this.initialized.catch(function (err) {
            exports.log.log("warn", "Error creating connection!", { module: "amqp-ts" });
            //throw (err);
        });
        return this.initialized;
    };
    Connection.prototype.tryToConnect = function (thisConnection, retry, callback) {
        var _this = this;
        AmqpLib.connect(thisConnection.url, thisConnection.socketOptions, function (err, connection) {
            /* istanbul ignore if */
            if (err) {
                // only do every retry once, amqplib can return multiple connection errors for one connection request (error?)
                if (retry <= _this._retry) {
                    //amqpts_log.log("warn" , "Double retry " + retry + ", skipping.", {module: "amqp-ts"});
                    return;
                }
                exports.log.log("warn", "Connection failed.", { module: "amqp-ts" });
                _this._retry = retry;
                if (thisConnection.reconnectStrategy.retries === 0 || thisConnection.reconnectStrategy.retries > retry) {
                    exports.log.log("warn", "Connection retry " + (retry + 1) + " in " + thisConnection.reconnectStrategy.interval + "ms", { module: "amqp-ts" });
                    setTimeout(thisConnection.tryToConnect, thisConnection.reconnectStrategy.interval, thisConnection, retry + 1, callback);
                }
                else {
                    exports.log.log("warn", "Connection failed, exiting: No connection retries left (retry " + retry + ").", { module: "amqp-ts" });
                    callback(err);
                }
            }
            else {
                var restart = function (err) {
                    exports.log.log("debug", "Connection error occurred.", { module: "amqp-ts" });
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
    };
    Connection.prototype._rebuildAll = function (err) {
        var _this = this;
        exports.log.log("warn", "Connection error: " + err.message, { module: "amqp-ts" });
        exports.log.log("debug", "Rebuilding connection NOW.", { module: "amqp-ts" });
        this.rebuildConnection();
        //re initialize exchanges, queues and bindings if they exist
        for (var exchangeId in this._exchanges) {
            var exchange = this._exchanges[exchangeId];
            exports.log.log("debug", "Re-initialize Exchange '" + exchange._name + "'.", { module: "amqp-ts" });
            exchange._initialize();
        }
        for (var queueId in this._queues) {
            var queue = this._queues[queueId];
            var consumer = queue._consumer;
            exports.log.log("debug", "Re-initialize queue '" + queue._name + "'.", { module: "amqp-ts" });
            queue._initialize();
            if (consumer) {
                exports.log.log("debug", "Re-initialize consumer for queue '" + queue._name + "'.", { module: "amqp-ts" });
                queue._initializeConsumer();
            }
        }
        for (var bindingId in this._bindings) {
            var binding = this._bindings[bindingId];
            exports.log.log("debug", "Re-initialize binding from '" + binding._source._name + "' to '" +
                binding._destination._name + "'.", { module: "amqp-ts" });
            binding._initialize();
        }
        return new Promise(function (resolve, reject) {
            _this.completeConfiguration().then(function () {
                exports.log.log("debug", "Rebuild success.", { module: "amqp-ts" });
                resolve(null);
            }, /* istanbul ignore next */ function (rejectReason) {
                exports.log.log("debug", "Rebuild failed.", { module: "amqp-ts" });
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
        var exchange = this._exchanges[name];
        if (exchange === undefined) {
            exchange = new Exchange(this, name, type, options);
        }
        return exchange;
    };
    Connection.prototype.declareQueue = function (name, options) {
        var queue = this._queues[name];
        if (queue === undefined) {
            queue = new Queue(this, name, options);
        }
        return queue;
    };
    Connection.prototype.declareTopology = function (topology) {
        var promises = [];
        var i;
        var len;
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
                var destination;
                if (binding.exchange !== undefined) {
                    destination = this.declareExchange(binding.exchange);
                }
                else {
                    destination = this.declareQueue(binding.queue);
                }
                promises.push(destination.bind(source, binding.pattern, binding.args));
            }
        }
        return Promise.all(promises);
    };
    return Connection;
}());
exports.Connection = Connection;
var Connection;
(function (Connection) {
    "use strict";
})(Connection = exports.Connection || (exports.Connection = {}));
//----------------------------------------------------------------------------------------------------
// Message class
//----------------------------------------------------------------------------------------------------
var Message = (function () {
    function Message(content, options) {
        if (options === void 0) { options = {}; }
        this.properties = options;
        if (content !== undefined) {
            this.setContent(content);
        }
    }
    Message.prototype.setContent = function (content) {
        if (typeof content === "string") {
            this.content = new Buffer(content);
        }
        else if (!(content instanceof Buffer)) {
            this.content = new Buffer(JSON.stringify(content));
            this.properties.contentType = "application/json";
        }
        else {
            this.content = content;
        }
    };
    Message.prototype.getContent = function () {
        var content = this.content.toString();
        if (this.properties.contentType === "application/json") {
            content = JSON.parse(content);
        }
        return content;
    };
    Message.prototype.sendTo = function (destination, routingKey) {
        var _this = this;
        if (routingKey === void 0) { routingKey = ""; }
        // inline function to send the message
        var sendMessage = function () {
            try {
                destination._channel.publish(exchange, routingKey, _this.content, _this.properties);
            }
            catch (err) {
                exports.log.log("debug", "Publish error: " + err.message, { module: "amqp-ts" });
                var destinationName = destination._name;
                var connection = destination._connection;
                exports.log.log("debug", "Try to rebuild connection, before Call.", { module: "amqp-ts" });
                connection._rebuildAll(err).then(function () {
                    exports.log.log("debug", "Retransmitting message.", { module: "amqp-ts" });
                    if (destination instanceof Queue) {
                        connection._queues[destinationName].publish(_this.content, _this.properties);
                    }
                    else {
                        connection._exchanges[destinationName].publish(_this.content, routingKey, _this.properties);
                    }
                });
            }
        };
        var exchange;
        if (destination instanceof Queue) {
            exchange = "";
            routingKey = destination._name;
        }
        else {
            exchange = destination._name;
        }
        // execute sync when possible
        if (destination.initialized.isFulfilled()) {
            sendMessage();
        }
        else {
            destination.initialized.then(sendMessage);
        }
    };
    Message.prototype.ack = function (allUpTo) {
        if (this._channel !== undefined) {
            this._channel.ack(this._message, allUpTo);
        }
    };
    Message.prototype.nack = function (allUpTo, requeue) {
        if (this._channel !== undefined) {
            this._channel.nack(this._message, allUpTo, requeue);
        }
    };
    Message.prototype.reject = function (requeue) {
        if (requeue === void 0) { requeue = false; }
        if (this._channel !== undefined) {
            this._channel.reject(this._message, requeue);
        }
    };
    return Message;
}());
exports.Message = Message;
//----------------------------------------------------------------------------------------------------
// Exchange class
//----------------------------------------------------------------------------------------------------
var Exchange = (function () {
    function Exchange(connection, name, type, options) {
        if (options === void 0) { options = {}; }
        this._connection = connection;
        this._name = name;
        this._type = type;
        this._options = options;
        this._initialize();
    }
    Object.defineProperty(Exchange.prototype, "name", {
        get: function () {
            return this._name;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Exchange.prototype, "type", {
        get: function () {
            return this._type;
        },
        enumerable: true,
        configurable: true
    });
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
                        var callback = function (err, ok) {
                            /* istanbul ignore if */
                            if (err) {
                                exports.log.log("error", "Failed to create exchange '" + _this._name + "'.", { module: "amqp-ts" });
                                delete _this._connection._exchanges[_this._name];
                                reject(err);
                            }
                            else {
                                resolve(ok);
                            }
                        };
                        if (_this._options.noCreate) {
                            _this._channel.checkExchange(_this._name, callback);
                        }
                        else {
                            _this._channel.assertExchange(_this._name, _this._type, _this._options, callback);
                        }
                    }
                });
            });
        });
        this._connection._exchanges[this._name] = this;
    };
    /**
     * deprecated, use 'exchange.send(message: Message)' instead
     */
    Exchange.prototype.publish = function (content, routingKey, options) {
        var _this = this;
        if (routingKey === void 0) { routingKey = ""; }
        if (options === void 0) { options = {}; }
        if (typeof content === "string") {
            content = new Buffer(content);
        }
        else if (!(content instanceof Buffer)) {
            content = new Buffer(JSON.stringify(content));
            options.contentType = options.contentType || "application/json";
        }
        this.initialized.then(function () {
            try {
                _this._channel.publish(_this._name, routingKey, content, options);
            }
            catch (err) {
                exports.log.log("warn", "Exchange publish error: " + err.message, { module: "amqp-ts" });
                var exchangeName = _this._name;
                var connection = _this._connection;
                connection._rebuildAll(err).then(function () {
                    exports.log.log("debug", "Retransmitting message.", { module: "amqp-ts" });
                    connection._exchanges[exchangeName].publish(content, routingKey, options);
                });
            }
        });
    };
    Exchange.prototype.send = function (message, routingKey) {
        if (routingKey === void 0) { routingKey = ""; }
        message.sendTo(this, routingKey);
    };
    Exchange.prototype.rpc = function (requestParameters, routingKey) {
        var _this = this;
        if (routingKey === void 0) { routingKey = ""; }
        return new Promise(function (resolve, reject) {
            var processRpc = function () {
                var consumerTag;
                _this._channel.consume(DIRECT_REPLY_TO_QUEUE, function (resultMsg) {
                    _this._channel.cancel(consumerTag);
                    var result = new Message(resultMsg.content, resultMsg.fields);
                    result.fields = resultMsg.fields;
                    resolve(result);
                }, { noAck: true }, function (err, ok) {
                    /* istanbul ignore if */
                    if (err) {
                        reject(new Error("amqp-ts: Queue.rpc error: " + err.message));
                    }
                    else {
                        // send the rpc request
                        consumerTag = ok.consumerTag;
                        var message = new Message(requestParameters, { replyTo: DIRECT_REPLY_TO_QUEUE });
                        message.sendTo(_this, routingKey);
                    }
                });
            };
            // execute sync when possible
            if (_this.initialized.isFulfilled()) {
                processRpc();
            }
            else {
                _this.initialized.then(processRpc);
            }
        });
    };
    Exchange.prototype.delete = function () {
        var _this = this;
        if (this._deleting === undefined) {
            this._deleting = new Promise(function (resolve, reject) {
                _this.initialized.then(function () {
                    return Binding.removeBindingsContaining(_this);
                }).then(function () {
                    _this._channel.deleteExchange(_this._name, {}, function (err, ok) {
                        /* istanbul ignore if */
                        if (err) {
                            reject(err);
                        }
                        else {
                            _this._channel.close(function (err) {
                                delete _this.initialized; // invalidate exchange
                                delete _this._connection._exchanges[_this._name]; // remove the exchange from our administration
                                /* istanbul ignore if */
                                if (err) {
                                    reject(err);
                                }
                                else {
                                    delete _this._channel;
                                    delete _this._connection;
                                    resolve(null);
                                }
                            });
                        }
                    });
                }).catch(function (err) {
                    reject(err);
                });
            });
        }
        return this._deleting;
    };
    Exchange.prototype.close = function () {
        var _this = this;
        if (this._closing === undefined) {
            this._closing = new Promise(function (resolve, reject) {
                _this.initialized.then(function () {
                    return Binding.removeBindingsContaining(_this);
                }).then(function () {
                    delete _this.initialized; // invalidate exchange
                    delete _this._connection._exchanges[_this._name]; // remove the exchange from our administration
                    _this._channel.close(function (err) {
                        /* istanbul ignore if */
                        if (err) {
                            reject(err);
                        }
                        else {
                            delete _this._channel;
                            delete _this._connection;
                            resolve(null);
                        }
                    });
                }).catch(function (err) {
                    reject(err);
                });
            });
        }
        return this._closing;
    };
    Exchange.prototype.bind = function (source, pattern, args) {
        if (pattern === void 0) { pattern = ""; }
        if (args === void 0) { args = {}; }
        var binding = new Binding(this, source, pattern, args);
        return binding.initialized;
    };
    Exchange.prototype.unbind = function (source, pattern, args) {
        if (pattern === void 0) { pattern = ""; }
        if (args === void 0) { args = {}; }
        return this._connection._bindings[Binding.id(this, source, pattern)].delete();
    };
    Exchange.prototype.consumerQueueName = function () {
        return this._name + "." + ApplicationName + "." + os.hostname() + "." + process.pid;
    };
    /**
     * deprecated, use 'exchange.activateConsumer(...)' instead
     */
    Exchange.prototype.startConsumer = function (onMessage, options) {
        var queueName = this.consumerQueueName();
        if (this._connection._queues[queueName]) {
            return new Promise(function (_, reject) {
                reject(new Error("amqp-ts Exchange.startConsumer error: consumer already defined"));
            });
        }
        else {
            var promises = [];
            var queue = this._connection.declareQueue(queueName, { durable: false });
            promises.push(queue.initialized);
            var binding = queue.bind(this);
            promises.push(binding);
            var consumer = queue.startConsumer(onMessage, options);
            promises.push(consumer);
            return Promise.all(promises);
        }
    };
    Exchange.prototype.activateConsumer = function (onMessage, options) {
        var queueName = this.consumerQueueName();
        if (this._connection._queues[queueName]) {
            return new Promise(function (_, reject) {
                reject(new Error("amqp-ts Exchange.activateConsumer error: consumer already defined"));
            });
        }
        else {
            var promises = [];
            var queue = this._connection.declareQueue(queueName, { durable: false });
            promises.push(queue.initialized);
            var binding = queue.bind(this);
            promises.push(binding);
            var consumer = queue.activateConsumer(onMessage, options);
            promises.push(consumer);
            return Promise.all(promises);
        }
    };
    Exchange.prototype.stopConsumer = function () {
        var queue = this._connection._queues[this.consumerQueueName()];
        if (queue) {
            return queue.delete();
        }
        else {
            return Promise.resolve();
        }
    };
    return Exchange;
}());
exports.Exchange = Exchange;
var Exchange;
(function (Exchange) {
    "use strict";
})(Exchange = exports.Exchange || (exports.Exchange = {}));
//----------------------------------------------------------------------------------------------------
// Queue class
//----------------------------------------------------------------------------------------------------
var Queue = (function () {
    function Queue(connection, name, options) {
        if (options === void 0) { options = {}; }
        this._connection = connection;
        this._name = name;
        this._options = options;
        this._connection._queues[this._name] = this;
        this._initialize();
    }
    Object.defineProperty(Queue.prototype, "name", {
        get: function () {
            return this._name;
        },
        enumerable: true,
        configurable: true
    });
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
                        var callback = function (err, ok) {
                            /* istanbul ignore if */
                            if (err) {
                                exports.log.log("error", "Failed to create queue '" + _this._name + "'.", { module: "amqp-ts" });
                                delete _this._connection._queues[_this._name];
                                reject(err);
                            }
                            else {
                                if (_this._options.prefetch) {
                                    _this._channel.prefetch(_this._options.prefetch);
                                }
                                resolve(ok);
                            }
                        };
                        if (_this._options.noCreate) {
                            _this._channel.checkQueue(_this._name, callback);
                        }
                        else {
                            _this._channel.assertQueue(_this._name, _this._options, callback);
                        }
                    }
                });
            });
        });
    };
    Queue._packMessageContent = function (content, options) {
        if (typeof content === "string") {
            content = new Buffer(content);
        }
        else if (!(content instanceof Buffer)) {
            content = new Buffer(JSON.stringify(content));
            options.contentType = "application/json";
        }
        return content;
    };
    Queue._unpackMessageContent = function (msg) {
        var content = msg.content.toString();
        if (msg.properties.contentType === "application/json") {
            content = JSON.parse(content);
        }
        return content;
    };
    /**
     * deprecated, use 'queue.send(message: Message)' instead
     */
    Queue.prototype.publish = function (content, options) {
        var _this = this;
        if (options === void 0) { options = {}; }
        // inline function to send the message
        var sendMessage = function () {
            try {
                _this._channel.sendToQueue(_this._name, content, options);
            }
            catch (err) {
                exports.log.log("debug", "Queue publish error: " + err.message, { module: "amqp-ts" });
                var queueName = _this._name;
                var connection = _this._connection;
                exports.log.log("debug", "Try to rebuild connection, before Call.", { module: "amqp-ts" });
                connection._rebuildAll(err).then(function () {
                    exports.log.log("debug", "Retransmitting message.", { module: "amqp-ts" });
                    connection._queues[queueName].publish(content, options);
                });
            }
        };
        content = Queue._packMessageContent(content, options);
        // execute sync when possible
        if (this.initialized.isFulfilled()) {
            sendMessage();
        }
        else {
            this.initialized.then(sendMessage);
        }
    };
    Queue.prototype.send = function (message, routingKey) {
        if (routingKey === void 0) { routingKey = ""; }
        message.sendTo(this, routingKey);
    };
    Queue.prototype.rpc = function (requestParameters) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var processRpc = function () {
                var consumerTag;
                _this._channel.consume(DIRECT_REPLY_TO_QUEUE, function (resultMsg) {
                    _this._channel.cancel(consumerTag);
                    var result = new Message(resultMsg.content, resultMsg.fields);
                    result.fields = resultMsg.fields;
                    resolve(result);
                }, { noAck: true }, function (err, ok) {
                    /* istanbul ignore if */
                    if (err) {
                        reject(new Error("amqp-ts: Queue.rpc error: " + err.message));
                    }
                    else {
                        // send the rpc request
                        consumerTag = ok.consumerTag;
                        var message = new Message(requestParameters, { replyTo: DIRECT_REPLY_TO_QUEUE });
                        message.sendTo(_this);
                    }
                });
            };
            // execute sync when possible
            if (_this.initialized.isFulfilled()) {
                processRpc();
            }
            else {
                _this.initialized.then(processRpc);
            }
        });
    };
    Queue.prototype.prefetch = function (count) {
        var _this = this;
        this.initialized.then(function () {
            _this._channel.prefetch(count);
            _this._options.prefetch = count;
        });
    };
    Queue.prototype.recover = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            _this.initialized.then(function () {
                _this._channel.recover(function (err, ok) {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve(null);
                    }
                });
            });
        });
    };
    /**
     * deprecated, use 'queue.activateConsumer(...)' instead
     */
    Queue.prototype.startConsumer = function (onMessage, options) {
        if (options === void 0) { options = {}; }
        if (this._consumerInitialized) {
            return new Promise(function (_, reject) {
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
    };
    Queue.prototype.activateConsumer = function (onMessage, options) {
        if (options === void 0) { options = {}; }
        if (this._consumerInitialized) {
            return new Promise(function (_, reject) {
                reject(new Error("amqp-ts Queue.activateConsumer error: consumer already defined"));
            });
        }
        this._consumerOptions = options;
        this._consumer = onMessage;
        this._initializeConsumer();
        return this._consumerInitialized;
    };
    Queue.prototype._initializeConsumer = function () {
        var _this = this;
        var processedMsgConsumer = function (msg) {
            try {
                /* istanbul ignore if */
                if (!msg) {
                    return; // ignore empty messages (for now)
                }
                var payload = Queue._unpackMessageContent(msg);
                var result = _this._consumer(payload);
                // check if there is a reply-to
                if (msg.properties.replyTo) {
                    var options = {};
                    if (result instanceof Promise) {
                        result.then(function (resultValue) {
                            resultValue = Queue._packMessageContent(result, options);
                            _this._channel.sendToQueue(msg.properties.replyTo, resultValue, options);
                        }).catch(function (err) {
                            exports.log.log("error", "Queue.onMessage RPC promise returned error: " + err.message, { module: "amqp-ts" });
                        });
                    }
                    else {
                        result = Queue._packMessageContent(result, options);
                        _this._channel.sendToQueue(msg.properties.replyTo, result, options);
                    }
                }
                if (_this._consumerOptions.noAck !== true) {
                    _this._channel.ack(msg);
                }
            }
            catch (err) {
                /* istanbul ignore next */
                exports.log.log("error", "Queue.onMessage consumer function returned error: " + err.message, { module: "amqp-ts" });
            }
        };
        var rawMsgConsumer = function (msg) {
            try {
                _this._consumer(msg, _this._channel);
            }
            catch (err) {
                /* istanbul ignore next */
                exports.log.log("error", "Queue.onMessage consumer function returned error: " + err.message, { module: "amqp-ts" });
            }
        };
        var activateConsumerWrapper = function (msg) {
            try {
                var message = new Message(msg.content, msg.properties);
                message.fields = msg.fields;
                message._message = msg;
                message._channel = _this._channel;
                var result = _this._consumer(message);
                // check if there is a reply-to
                if (msg.properties.replyTo) {
                    if (result instanceof Promise) {
                        result.then(function (resultValue) {
                            if (!(resultValue instanceof Message)) {
                                resultValue = new Message(resultValue, {});
                            }
                            _this._channel.sendToQueue(msg.properties.replyTo, resultValue.content, resultValue.properties);
                        }).catch(function (err) {
                            exports.log.log("error", "Queue.onMessage RPC promise returned error: " + err.message, { module: "amqp-ts" });
                        });
                    }
                    else {
                        if (!(result instanceof Message)) {
                            result = new Message(result, {});
                        }
                        _this._channel.sendToQueue(msg.properties.replyTo, result.content, result.properties);
                    }
                }
            }
            catch (err) {
                /* istanbul ignore next */
                exports.log.log("error", "Queue.onMessage consumer function returned error: " + err.message, { module: "amqp-ts" });
            }
        };
        this._consumerInitialized = new Promise(function (resolve, reject) {
            _this.initialized.then(function () {
                var consumerFunction = activateConsumerWrapper;
                if (_this._isStartConsumer) {
                    consumerFunction = _this._rawConsumer ? rawMsgConsumer : processedMsgConsumer;
                }
                _this._channel.consume(_this._name, consumerFunction, _this._consumerOptions, function (err, ok) {
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
        if (!this._consumerInitialized || this._consumerStopping) {
            return Promise.resolve();
        }
        this._consumerStopping = true;
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
                        delete _this._consumerStopping;
                        resolve(null);
                    }
                });
            });
        });
    };
    Queue.prototype.delete = function () {
        var _this = this;
        if (this._deleting === undefined) {
            this._deleting = new Promise(function (resolve, reject) {
                _this.initialized.then(function () {
                    return Binding.removeBindingsContaining(_this);
                }).then(function () {
                    return _this.stopConsumer();
                }).then(function () {
                    return _this._channel.deleteQueue(_this._name, {}, function (err, ok) {
                        /* istanbul ignore if */
                        if (err) {
                            reject(err);
                        }
                        else {
                            delete _this.initialized; // invalidate queue
                            delete _this._connection._queues[_this._name]; // remove the queue from our administration
                            _this._channel.close(function (err) {
                                /* istanbul ignore if */
                                if (err) {
                                    reject(err);
                                }
                                else {
                                    delete _this._channel;
                                    delete _this._connection;
                                    resolve(ok);
                                }
                            });
                        }
                    });
                }).catch(function (err) {
                    reject(err);
                });
            });
        }
        return this._deleting;
    };
    Queue.prototype.close = function () {
        var _this = this;
        if (this._closing === undefined) {
            this._closing = new Promise(function (resolve, reject) {
                _this.initialized.then(function () {
                    return Binding.removeBindingsContaining(_this);
                }).then(function () {
                    return _this.stopConsumer();
                }).then(function () {
                    delete _this.initialized; // invalidate queue
                    delete _this._connection._queues[_this._name]; // remove the queue from our administration
                    _this._channel.close(function (err) {
                        /* istanbul ignore if */
                        if (err) {
                            reject(err);
                        }
                        else {
                            delete _this._channel;
                            delete _this._connection;
                            resolve(null);
                        }
                    });
                }).catch(function (err) {
                    reject(err);
                });
            });
        }
        return this._closing;
    };
    Queue.prototype.bind = function (source, pattern, args) {
        if (pattern === void 0) { pattern = ""; }
        if (args === void 0) { args = {}; }
        var binding = new Binding(this, source, pattern, args);
        return binding.initialized;
    };
    Queue.prototype.unbind = function (source, pattern, args) {
        if (pattern === void 0) { pattern = ""; }
        if (args === void 0) { args = {}; }
        return this._connection._bindings[Binding.id(this, source, pattern)].delete();
    };
    return Queue;
}());
exports.Queue = Queue;
var Queue;
(function (Queue) {
    "use strict";
})(Queue = exports.Queue || (exports.Queue = {}));
//----------------------------------------------------------------------------------------------------
// Binding class
//----------------------------------------------------------------------------------------------------
var Binding = (function () {
    function Binding(destination, source, pattern, args) {
        if (pattern === void 0) { pattern = ""; }
        if (args === void 0) { args = {}; }
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
            if (_this._destination instanceof Queue) {
                var queue = _this._destination;
                queue.initialized.then(function () {
                    queue._channel.bindQueue(_this._destination._name, _this._source._name, _this._pattern, _this._args, function (err, ok) {
                        /* istanbul ignore if */
                        if (err) {
                            exports.log.log("error", "Failed to create queue binding (" +
                                _this._source._name + "->" + _this._destination._name + ")", { module: "amqp-ts" });
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
                var exchange = _this._destination;
                exchange.initialized.then(function () {
                    exchange._channel.bindExchange(_this._destination._name, _this._source._name, _this._pattern, _this._args, function (err, ok) {
                        /* istanbul ignore if */
                        if (err) {
                            exports.log.log("error", "Failed to create exchange binding (" +
                                _this._source._name + "->" + _this._destination._name + ")", { module: "amqp-ts" });
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
}());
exports.Binding = Binding;

//# sourceMappingURL=amqp-ts.js.map
