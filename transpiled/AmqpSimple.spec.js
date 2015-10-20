/**
 * Tests for AmqpSimple
 * Created by Ab on 16-9-2015.
 */
var winston = require("winston");
var Chai = require("chai");
var expect = Chai.expect;
var amqp_ts_1 = require("../lib/amqp-ts");
/**
 * Until we get a good mock for amqplib we will test using a local rabbitmq instance
 */
// define test defaults
var ConnectionUrl = process.env.AMQPTEST_CONNECTION_URL || "amqp://localhost";
var UnitTestTimeout = process.env.AMQPTEST_TIMEOUT || 1000;
var LogLevel = process.env.AMQPTEST_LOGLEVEL || "warn";
// set logging level
winston.level = LogLevel;
/* istanbul ignore next */
describe("Test AmqpSimple module", function () {
    this.timeout(UnitTestTimeout); // define default timeout
    // cleanup function for the AMQP connection, also tests the Connection.deleteConfiguration method
    function cleanup(connection, done) {
        connection.deleteConfiguration().then(function () {
            return connection.close();
        }).then(function () {
            done();
        }, function (err) {
            done(err);
        });
    }
    describe("AMQP Connection class initialization", function () {
        it("should create a RabbitMQ connection", function (done) {
            // test code
            var connection = new amqp_ts_1.AmqpSimple.Connection(ConnectionUrl);
            // check result
            connection.initialized.then(function () {
                connection.close().then(function () {
                    done();
                }, function () {
                    done(new Error("Failed to close the new AMQP Connection"));
                });
            }, function () {
                done(new Error("Failed to create a new AMQP Connection."));
            });
        });
    });
    describe("AMQP usage", function () {
        /**
         * normal practice is to test each feature isolated.
         * This is however not very practical in this situation, because we would have to test the same features over and over
         * We will however try to identify test failures as specific as possible
         */
        it("should create a Queue and send and receive simple string messages", function (done) {
            // initialize
            var connection = new amqp_ts_1.AmqpSimple.Connection(ConnectionUrl);
            // test code
            var queue = connection.declareQueue("TestQueue");
            queue.startConsumer(function (message) {
                expect(message).equals("Test");
                cleanup(connection, done);
            });
            connection.completeConfiguration().then(function () {
                queue.publish("Test");
            }, function (err) {
                done(err);
            });
        });
        it("should create a Queue and send and receive simple string objects", function (done) {
            // initialize
            var connection = new amqp_ts_1.AmqpSimple.Connection(ConnectionUrl);
            // test code
            var queue = connection.declareQueue("TestQueue");
            var testObj = {
                text: "Test"
            };
            queue.startConsumer(function (message) {
                expect(message).eql(testObj);
                cleanup(connection, done);
            });
            connection.completeConfiguration().then(function () {
                queue.publish(testObj);
            }, function (err) {
                done(err);
            });
        });
        it("should create an Exchange, Queue and binding and send and receive simple string messages", function (done) {
            // initialize
            var connection = new amqp_ts_1.AmqpSimple.Connection(ConnectionUrl);
            // test code
            var exchange = connection.declareExchange("TestExchange");
            var queue = connection.declareQueue("TestQueue");
            queue.bind(exchange);
            queue.startConsumer(function (message) {
                expect(message).equals("Test");
                cleanup(connection, done);
            });
            connection.completeConfiguration().then(function () {
                exchange.publish("Test");
            }, function (err) {
                done(err);
            });
        });
        it("should create an Exchange, Queue and binding and send and receive objects", function (done) {
            // initialize
            var connection = new amqp_ts_1.AmqpSimple.Connection(ConnectionUrl);
            // test code
            var exchange = connection.declareExchange("TestExchange");
            var queue = connection.declareQueue("TestQueue");
            var testObj = {
                text: "Test"
            };
            queue.bind(exchange);
            queue.startConsumer(function (message) {
                expect(message).eql(testObj);
                cleanup(connection, done);
            });
            connection.completeConfiguration().then(function () {
                exchange.publish(testObj);
            }, function (err) {
                done(err);
            });
        });
        it("should create an Exchange and send and receive simple string messages", function (done) {
            // initialize
            var connection = new amqp_ts_1.AmqpSimple.Connection(ConnectionUrl);
            // test code
            var exchange = connection.declareExchange("TestExchange");
            exchange.startConsumer(function (message) {
                expect(message).equals("Test");
                cleanup(connection, done);
            });
            connection.completeConfiguration().then(function () {
                exchange.publish("Test");
            }, function (err) {
                done(err);
            });
        });
        it("should bind Exchanges", function (done) {
            // initialize
            var connection = new amqp_ts_1.AmqpSimple.Connection(ConnectionUrl);
            // test code
            var exchange1 = connection.declareExchange("TestExchange1");
            var exchange2 = connection.declareExchange("TestExchange2");
            var queue = connection.declareQueue("TestQueue");
            exchange2.bind(exchange1);
            queue.bind(exchange2);
            queue.startConsumer(function (message) {
                expect(message).eql("Test");
                cleanup(connection, done);
            });
            connection.completeConfiguration().then(function () {
                exchange1.publish("Test");
            }, function (err) {
                done(err);
            });
        });
        it("should reconnect when sending a message to an Exchange after a broken connection", function (done) {
            // initialize
            var connection = new amqp_ts_1.AmqpSimple.Connection(ConnectionUrl);
            // test code
            var exchange1 = connection.declareExchange("TestExchange1");
            var exchange2 = connection.declareExchange("TestExchange1");
            exchange2.bind(exchange1);
            var queue = connection.declareQueue("TestQueue");
            queue.bind(exchange2);
            queue.startConsumer(function (message) {
                expect(message).equals("Test");
                cleanup(connection, done);
            }).catch(function (err) {
                console.log("Consumer intialization FAILED!!!");
                done(err);
            });
            connection.completeConfiguration().then(function () {
                // break connection
                connection._connection.close(function (err) {
                    if (err) {
                        done(err);
                    }
                    else {
                        // it should auto reconnect and send the message
                        exchange1.publish("Test");
                    }
                });
            }, function (err) {
                done(err);
            });
        });
        it("should reconnect when sending a message to a Queue after a broken connection", function (done) {
            // initialize
            var connection = new amqp_ts_1.AmqpSimple.Connection(ConnectionUrl);
            // test code
            // var exchange1 = connection.declareExchange("TestExchange1");
            // var exchange2 = connection.declareExchange("TestExchange1");
            // exchange2.bind(exchange1);
            var queue = connection.declareQueue("TestQueue");
            //queue.bind(exchange1);
            queue.startConsumer(function (message) {
                expect(message).equals("Test");
                cleanup(connection, done);
            }).catch(function (err) {
                console.log("Consumer intialization FAILED!!!");
                done(err);
            });
            connection.completeConfiguration().then(function () {
                // break connection
                connection._connection.close(function (err) {
                    if (err) {
                        done(err);
                    }
                    else {
                        // it should auto reconnect and send the message
                        queue.publish("Test");
                    }
                });
            }, function (err) {
                done(err);
            });
        });
        it("should unbind Exchanges and Queues", function (done) {
            // initialize
            var connection = new amqp_ts_1.AmqpSimple.Connection(ConnectionUrl);
            // test code
            var exchange1 = connection.declareExchange("TestExchange1");
            var exchange2 = connection.declareExchange("TestExchange2");
            var queue = connection.declareQueue("TestQueue");
            exchange2.bind(exchange1);
            queue.bind(exchange2);
            queue.startConsumer(function (message) {
                expect(message).eql("Test");
                exchange2.unbind(exchange1).then(function () {
                    return queue.unbind(exchange2);
                }).then(function () {
                    cleanup(connection, done);
                });
            });
            connection.completeConfiguration().then(function () {
                exchange1.publish("Test");
            }, function (err) {
                done(err);
            });
        });
        it("should delete Exchanges and Queues", function (done) {
            // initialize
            var connection = new amqp_ts_1.AmqpSimple.Connection(ConnectionUrl);
            // test code
            var exchange1 = connection.declareExchange("TestExchange1");
            var exchange2 = connection.declareExchange("TestExchange2");
            var queue = connection.declareQueue("TestQueue");
            exchange2.bind(exchange1);
            queue.bind(exchange2);
            queue.startConsumer(function (message) {
                expect(message).eql("Test");
                exchange2.delete().then(function () {
                    return queue.delete();
                }).then(function () {
                    cleanup(connection, done);
                });
            });
            connection.completeConfiguration().then(function () {
                exchange1.publish("Test");
            }, function (err) {
                done(err);
            });
        });
        it("should not start 2 consumers for the same queue", function (done) {
            // initialize
            var connection = new amqp_ts_1.AmqpSimple.Connection(ConnectionUrl);
            // test code
            var exchange1 = connection.declareExchange("TestExchange1");
            var queue = connection.declareQueue("TestQueue");
            queue.bind(exchange1);
            queue.startConsumer(function (message) {
                done(new Error("Received unexpected message"));
            });
            queue.startConsumer(function (message) {
                done(new Error("Received unexpected message"));
            }).catch(function (err) {
                expect(err.message).equal("AMQP Queue.startConsumer error: consumer already defined");
                cleanup(connection, done);
            });
        });
        it("should not start 2 consumers for the same exchange", function (done) {
            // initialize
            var connection = new amqp_ts_1.AmqpSimple.Connection(ConnectionUrl);
            // test code
            var exchange1 = connection.declareExchange("TestExchange1");
            exchange1.startConsumer(function (message) {
                done(new Error("Received unexpected message"));
            });
            exchange1.startConsumer(function (message) {
                done(new Error("Received unexpected message"));
            }).catch(function (err) {
                expect(err.message).equal("AMQP Exchange.startConsumer error: consumer already defined");
                cleanup(connection, done);
            });
        });
        it("should stop an Exchange consumer", function (done) {
            // initialize
            var connection = new amqp_ts_1.AmqpSimple.Connection(ConnectionUrl);
            // test code
            var exchange1 = connection.declareExchange("TestExchange1");
            exchange1.startConsumer(function (message) {
                done(new Error("Received unexpected message"));
            });
            exchange1.stopConsumer().then(function () {
                cleanup(connection, done);
            });
        });
        it("should generate an error when stopping a non existing Exchange consumer", function (done) {
            // initialize
            var connection = new amqp_ts_1.AmqpSimple.Connection(ConnectionUrl);
            // test code
            var exchange1 = connection.declareExchange("TestExchange1");
            exchange1.startConsumer(function (message) {
                done(new Error("Received unexpected message"));
            });
            exchange1.stopConsumer().then(function () {
                return exchange1.stopConsumer();
            }).catch(function (err) {
                expect(err.message).equals("AMQP Exchange.cancelConsumer error: no consumer defined");
                cleanup(connection, done);
            });
        });
        it("should generate an error when stopping a non existing Queue consumer", function (done) {
            // initialize
            var connection = new amqp_ts_1.AmqpSimple.Connection(ConnectionUrl);
            // test code
            var queue = connection.declareQueue("TestQueue");
            queue.startConsumer(function (message) {
                done(new Error("Received unexpected message"));
            });
            queue.stopConsumer().then(function () {
                return queue.stopConsumer();
            }).catch(function (err) {
                expect(err.message).equals("AMQP Queue.cancelConsumer error: no consumer defined");
                cleanup(connection, done);
            });
        });
        it("should send a message to a queue before the queue is explicitely initialized", function (done) {
            // initialize
            var connection = new amqp_ts_1.AmqpSimple.Connection(ConnectionUrl);
            // test code
            var queue = connection.declareQueue("TestQueue");
            queue.publish("Test");
            queue.startConsumer(function (message) {
                expect(message).equals("Test");
                cleanup(connection, done);
            });
        });
    });
});

//# sourceMappingURL=AmqpSimple.spec.js.map
