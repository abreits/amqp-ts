/**
 * Tests for AmqpSimple
 * Created by Ab on 2015-09-16.
 */
import * as winston from "winston";
import * as Chai from "chai";
var expect = Chai.expect;

import * as AmqpLib from "amqplib/callback_api";
import * as Amqp from "../lib/amqp-ts";

/**
 * Until we get a good mock for amqplib we will test using a local rabbitmq instance
 */
// define test defaults
var ConnectionUrl = process.env.AMQPTEST_CONNECTION_URL || "amqp://localhost";
var UnitTestTimeout = process.env.AMQPTEST_TIMEOUT || 1000;
var LogLevel = process.env.AMQPTEST_LOGLEVEL || "warn";
var testExchangeNamePrefix = process.env.AMQPTEST_EXCHANGE_PREFIX || "TestExchange_";
var testQueueNamePrefix = process.env.AMQPTEST_QUEUE_PREFIX || "TestQueue_";

// set logging level
winston.level = LogLevel;

/* istanbul ignore next */
describe("Test AmqpSimple module", function() {
  this.timeout(UnitTestTimeout); // define default timeout

  // create unique queues and exchanges for each test so they do not interfere with each other
  var testExchangeNumber = 0;
  function nextExchangeName() {
    testExchangeNumber++;
    return testExchangeNamePrefix + testExchangeNumber;
  }
  var testQueueNumber = 0;
  function nextQueueName() {
    testQueueNumber++;
    return testQueueNamePrefix + testQueueNumber;
  }

  // keep track of the created connections for cleanup
  var connections: Amqp.Connection[] = [];
  function getAmqpConnection() {
    var conn = new Amqp.Connection(ConnectionUrl);
    connections.push(conn);
    return conn;
  }

  // cleanup failed tests
  // unfortunately does still not execute after encountering an error in mocha, perhaps in future versions
  function after(done) {
    var processAll: Promise<any>[] = [];
    console.log("cleanup phase!");
    for (var i = 0, l = connections.length; i < l; i++) {
      processAll.push(connections[i].deleteConfiguration());
    }
    Promise.all(processAll).then(() => {
      done();
    }).catch((err) => {
      done(err);
    });
  }

  // cleanup function for the AMQP connection, also tests the Connection.deleteConfiguration method
  function cleanup(connection, done, error?) {
    connection.deleteConfiguration().then(() => {
      return connection.close();
    }).then(() => {
      done(error);
    }, (err) => {
      done(err);
    });
  }

  describe("AMQP Connection class initialization", function () {
    it("should create a RabbitMQ connection", function (done) {
      // test code
      var connection = getAmqpConnection();
      // check result
      connection.initialized.then(() => { // successfully create the AMQP connection
        connection.close().then(() => { // successfully close the AMQP connection
          done();
        }, () => { // failed to close the AMQP connection
          done(new Error("Failed to close the new AMQP Connection"));
        });
      }, () => { // failed to create the AMQP connection
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
      var connection = getAmqpConnection();

      // test code
      var queue = connection.declareQueue(nextQueueName());

      queue.startConsumer((message) => {
        try {
          expect(message).equals("Test");
          cleanup(connection, done);
        } catch (err) {
          cleanup(connection, done, err);
        }
      });

      connection.completeConfiguration().then(() => {
        queue.publish("Test");
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should create a Queue and send and receive simple string objects", (done) => {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var queue = connection.declareQueue(nextQueueName());
      var testObj = {
        text: "Test"
      };

      queue.startConsumer((message) => {
        try {
          expect(message).eql(testObj);
          cleanup(connection, done);
        } catch (err) {
          cleanup(connection, done, err);
        }
      });

      connection.completeConfiguration().then(() => {
        queue.publish(testObj);
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should create a Queue, send a simple string message and receive the raw message", function (done) {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var queue = connection.declareQueue(nextQueueName());
      var rawConsumer = (message: AmqpLib.Message, channel: AmqpLib.Channel) => {
        try {
          expect(message.content.toString()).equals("Test");
          channel.ack(message);
          cleanup(connection, done);
        } catch (err) {
          cleanup(connection, done, err);
        }
      };

      queue.startConsumer(rawConsumer, {rawMessage: true});

      connection.completeConfiguration().then(() => {
        queue.publish("Test");
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should create an Exchange, Queue and binding and send and receive simple string messages", (done) => {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var exchange = connection.declareExchange(nextExchangeName());
      var queue = connection.declareQueue(nextQueueName());
      queue.bind(exchange);
      queue.startConsumer((message) => {
        try {
          expect(message).equals("Test");
          cleanup(connection, done);
        } catch (err) {
          cleanup(connection, done, err);
        }

      });

      connection.completeConfiguration().then(() => {
        exchange.publish("Test");
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should create an Exchange, Queue and binding and send and receive objects", (done) => {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var exchange = connection.declareExchange(nextExchangeName());
      var queue = connection.declareQueue(nextQueueName());
      var testObj = {
        text: "Test"
      };

      queue.bind(exchange);
      queue.startConsumer((message) => {
        try {
          expect(message).eql(testObj);
          cleanup(connection, done);
        } catch (err) {
          cleanup(connection, done, err);
        }
      });

      connection.completeConfiguration().then(() => {
        exchange.publish(testObj);
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should create an Exchange and send and receive simple string messages", (done) => {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var exchange = connection.declareExchange(nextExchangeName());
      exchange.startConsumer((message) => {
        try {
          expect(message).equals("Test");
          cleanup(connection, done);
        } catch (err) {
          cleanup(connection, done, err);
        }
      });

      connection.completeConfiguration().then(() => {
        exchange.publish("Test");
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should bind Exchanges", (done) => {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var exchange1 = connection.declareExchange(nextExchangeName());
      var exchange2 = connection.declareExchange(nextExchangeName());
      var queue = connection.declareQueue(nextQueueName());

      exchange2.bind(exchange1);
      queue.bind(exchange2);
      queue.startConsumer((message) => {
        try {
          expect(message).equals("Test");
          cleanup(connection, done);
        } catch (err) {
          cleanup(connection, done, err);
        }
      });

      connection.completeConfiguration().then(() => {
        exchange1.publish("Test");
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should reconnect when sending a message to an Exchange after a broken connection", (done) => {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var exchange1 = connection.declareExchange(nextExchangeName());
      var exchange2 = connection.declareExchange(nextExchangeName());
      exchange2.bind(exchange1);
      var queue = connection.declareQueue(nextQueueName());
      queue.bind(exchange2);
      queue.startConsumer((message) => {
        try {
          expect(message).equals("Test");
          cleanup(connection, done);
        } catch (err) {
          cleanup(connection, done, err);
        }
      }).catch((err) => {
        console.log("Consumer intialization FAILED!!!");
        done(err);
      });

      connection.completeConfiguration().then(() => {
        // break connection
        (<any>connection)._connection.close((err) => {
          if (err) {
            done(err);
          } else {
            // it should auto reconnect and send the message
            exchange1.publish("Test");
          }
        });
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should reconnect when sending a message to a Queue after a broken connection", (done) => {
      // initialize
      var connection = getAmqpConnection();

      // test code
      // var exchange1 = connection.declareExchange(nextExchangeName());
      // var exchange2 = connection.declareExchange(nextExchangeName());
      // exchange2.bind(exchange1);
      var queue = connection.declareQueue(nextQueueName());
      //queue.bind(exchange1);
      queue.startConsumer((message) => {
        try {
          expect(message).equals("Test");
          cleanup(connection, done);
        } catch (err) {
          cleanup(connection, done, err);
        }
      }).catch((err) => {
        console.log("Consumer intialization FAILED!!!");
        done(err);
      });

      connection.completeConfiguration().then(() => {
        // break connection
        (<any>connection)._connection.close((err) => {
          if (err) {
            done(err);
          } else {
            // it should auto reconnect and send the message
            queue.publish("Test");
          }
        });
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should unbind Exchanges and Queues", (done) => {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var exchange1 = connection.declareExchange(nextExchangeName());
      var exchange2 = connection.declareExchange(nextExchangeName());
      var queue = connection.declareQueue(nextQueueName());

      exchange2.bind(exchange1);
      queue.bind(exchange2);
      queue.startConsumer((message) => {
        try {
          expect(message).equals("Test");
          exchange2.unbind(exchange1).then(() => {
            return queue.unbind(exchange2);
          }).then(() => {
            cleanup(connection, done);
          });
        } catch (err) {
          cleanup(connection, done, err);
        }
      });

      connection.completeConfiguration().then(() => {
        exchange1.publish("Test");
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should delete Exchanges and Queues", (done) => {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var exchange1 = connection.declareExchange(nextExchangeName());
      var exchange2 = connection.declareExchange(nextExchangeName());
      var queue = connection.declareQueue(nextQueueName());

      exchange2.bind(exchange1);
      queue.bind(exchange2);
      queue.startConsumer((message) => {
        try {
          expect(message).equals("Test");
          exchange2.delete().then(() => {
            return queue.delete();
          }).then(() => {
            cleanup(connection, done);
          });
        } catch (err) {
          cleanup(connection, done, err);
        }
      });

      connection.completeConfiguration().then(() => {
        exchange1.publish("Test");
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should not start 2 consumers for the same queue", (done) => {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var exchange1 = connection.declareExchange(nextExchangeName());
      var queue = connection.declareQueue(nextQueueName());

      queue.bind(exchange1);
      queue.startConsumer((message) => {
        cleanup(connection, done, new Error("Received unexpected message"));
      });
      queue.startConsumer((message) => {
        cleanup(connection, done, new Error("Received unexpected message"));
      }).catch((err) => {
        expect(err.message).equal("amqp-ts Queue.startConsumer error: consumer already defined");
        cleanup(connection, done);
      });
    });

    it("should not start 2 consumers for the same exchange", (done) => {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var exchange1 = connection.declareExchange(nextExchangeName());

      exchange1.startConsumer((message) => {
        cleanup(connection, done, new Error("Received unexpected message"));
      });
      exchange1.startConsumer((message) => {
        cleanup(connection, done, new Error("Received unexpected message"));
      }).catch((err) => {
        expect(err.message).equal("amqp-ts Exchange.startConsumer error: consumer already defined");
        cleanup(connection, done);
      });
    });

    it("should stop an Exchange consumer", (done) => {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var exchange1 = connection.declareExchange(nextExchangeName());

      exchange1.startConsumer((message) => {
        cleanup(connection, done, new Error("Received unexpected message"));
      });
      exchange1.stopConsumer().then(() => {
        cleanup(connection, done);
      });
    });

    it("should generate an error when stopping a non existing Exchange consumer", (done) => {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var exchange1 = connection.declareExchange(nextExchangeName());

      exchange1.startConsumer((message) => {
        cleanup(connection, done, new Error("Received unexpected message"));
      });
      exchange1.stopConsumer().then(() => {
        return exchange1.stopConsumer();
      }).catch((err) => {
        expect(err.message).equals("amqp-ts Exchange.cancelConsumer error: no consumer defined");
        cleanup(connection, done);
      });
    });

    it("should generate an error when stopping a non existing Queue consumer", (done) => {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var queue = connection.declareQueue(nextQueueName());

      queue.startConsumer((message) => {
        cleanup(connection, done, new Error("Received unexpected message"));
      });
      queue.stopConsumer().then(() => {
        return queue.stopConsumer();
      }).catch((err) => {
        expect(err.message).equals("amqp-ts Queue.cancelConsumer error: no consumer defined");
        cleanup(connection, done);
      });
    });

    it("should send a message to a queue before the queue is explicitely initialized", (done) => {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var queue = connection.declareQueue(nextQueueName());

      queue.publish("Test");

      queue.startConsumer((message) => {
        try {
          expect(message).equals("Test");
          cleanup(connection, done);
        } catch (err) {
          cleanup(connection, done, err);
        }
      });
    });

    it("should accept optional parameters", (done) => {
      // initialize
      var connection = getAmqpConnection();
      var messagesReceived = 0;

      // test code
      var exchange1 = connection.declareExchange(nextExchangeName(), "topic", {durable: true});
      var exchange2 = connection.declareExchange(nextExchangeName(), "topic", {durable: true});
      var queue = connection.declareQueue(nextQueueName(), {durable: true});
      queue.bind(exchange1, "*.*", {});
      exchange1.bind(exchange2, "*.test", {});

      connection.completeConfiguration().then(() => {
        exchange2.publish("ParameterTest", "topic.test", {});
        exchange1.publish("ParameterTest", "topic.test2", {});
        queue.publish("ParameterTest", {});
      });

      queue.startConsumer((message) => {
        try {
          expect(message).equals("ParameterTest");
          messagesReceived++;
          //expect three messages
          if (messagesReceived === 3) {
            cleanup(connection, done);
          }
        } catch (err) {
          cleanup(connection, done, err);
        }
      });
    });

    it("should close an exchange and a queue", function (done) {
      // initialize
      var connection = getAmqpConnection();
      var messagesReceived = 0;

      // test code
      var exchangeName = nextExchangeName();
      var queueName = nextQueueName();

      var exchange = connection.declareExchange(exchangeName);
      var queue = connection.declareQueue(queueName);
      queue.bind(exchange);

      connection.completeConfiguration().then(function () {
        exchange.publish("InQueueTest");
        exchange.close().then(function () {
          return queue.close();
        }).then(function () {
          queue = connection.declareQueue(queueName);
          return queue.initialized;
        }).then(function () {
          exchange = connection.declareExchange(exchangeName);
          return queue.initialized;
        }).then((result) => {
          expect(result.messageCount).equals(1);
          cleanup(connection, done);
        }).catch((err) => {
          console.log(err);
          cleanup(connection, done);
        });
      });
    });

    it("should delete an exchange and a queue", function(done) {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var exchangeName = nextExchangeName();
      var queueName = nextQueueName();

      var exchange = connection.declareExchange(exchangeName);
      var queue = connection.declareQueue(queueName);
      queue.bind(exchange);

      connection.completeConfiguration().then(function () {
        exchange.publish("InQueueTest");
        exchange.delete().then(function () {
          return queue.delete();
        }).then(function () {
          queue = connection.declareQueue(queueName);
          return queue.initialized;
        }).then((result) => {
          expect(result.messageCount).equals(0);
          cleanup(connection, done);
        });
      });
    });

    it("should process a queue rpc", function(done) {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var queue = connection.declareQueue(nextQueueName());

      queue.startConsumer((message) => {
        return message.reply;
      });

      connection.completeConfiguration().then(function () {
        queue.rpc({reply: "TestRpc"}).then((result) => {
          try {
            expect(result).equals("TestRpc");
            cleanup(connection, done);
          } catch (err) {
            cleanup(connection, done, err);
          }
        });
      });
    });

    it("should process an unresolved queue rpc", function(done) {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var queue = connection.declareQueue(nextQueueName());

      queue.startConsumer((message) => {
        return message.reply;
      });

      queue.rpc({reply: "TestRpc"}).then((result) => {
        try {
          expect(result).equals("TestRpc");
          cleanup(connection, done);
        } catch (err) {
          cleanup(connection, done, err);
        }
      });
    });

    it("should process an exchange rpc", function(done) {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var exchange = connection.declareExchange(nextExchangeName());

      exchange.startConsumer((message) => {
        return message.reply;
      });

      connection.completeConfiguration().then(function () {
        exchange.rpc({reply: "TestRpc"}).then((result) => {
          try {
            expect(result).equals("TestRpc");
            cleanup(connection, done);
          } catch (err) {
            cleanup(connection, done, err);
          }
        });
      });
    });
  });
});
