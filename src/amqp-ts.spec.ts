/**
 * Tests for amqp-ts
 * Created by Ab on 2015-09-16.
 */
import * as Promise from "bluebird";
import * as Chai from "chai";
var expect = Chai.expect;

import * as AmqpLib from "amqplib";
import * as Amqp from "../lib/amqp-ts";

/**
 * Until we get a good mock for amqplib we will test using a local rabbitmq instance
 */
// define test defaults
var ConnectionUrl = process.env.AMQPTEST_CONNECTION_URL || "amqp://localhost";
var UnitTestTimeout = process.env.AMQPTEST_TIMEOUT || 1500;
var LogLevel = process.env.AMQPTEST_LOGLEVEL || "critical";
var testExchangeNamePrefix = process.env.AMQPTEST_EXCHANGE_PREFIX || "TestExchange_";
var testQueueNamePrefix = process.env.AMQPTEST_QUEUE_PREFIX || "TestQueue_";

// set logging level
Amqp.log.transports.console.level = LogLevel;

/* istanbul ignore next */
describe("Test amqp-ts module", function () {
  this.timeout(UnitTestTimeout); // define default timeout

  // create unique queues and exchanges for each test so they do not interfere with each other
  var testExchangeNumber = 0;
  function nextExchangeName(): string {
    testExchangeNumber++;
    return testExchangeNamePrefix + testExchangeNumber;
  }
  var testQueueNumber = 0;
  function nextQueueName(): string {
    testQueueNumber++;
    return testQueueNamePrefix + testQueueNumber;
  }

  // keep track of the created connections for cleanup
  var connections: Amqp.Connection[] = [];
  function getAmqpConnection() {
    var conn = new Amqp.Connection(ConnectionUrl, {}, { retries: 5, interval: 1500 });
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
      connection.initialized
        .then(() => { // successfully create the AMQP connection
          connection.close().then(() => { // successfully close the AMQP connection
            done();
          });
        })
        .catch(() => { // failed to create the AMQP connection
          done(new Error("Failed to create a new AMQP Connection."));
        });
    });
  });

  describe("AMQP Deprecated usage tests", function () {
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


    it("should create a Queue, send a simple string message and receive the raw message", (done) => {
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

      queue.startConsumer(rawConsumer, { rawMessage: true });

      connection.completeConfiguration().then(() => {
        queue.publish("Test");
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should create a Queue, send a simple string message and receive the raw message", (done) => {
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

      queue.startConsumer(rawConsumer, { rawMessage: true });

      connection.completeConfiguration().then(() => {
        queue.publish("Test");
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
      queue.bind(exchange1);
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

    it("should not generate an error when stopping a non existing Exchange consumer", (done) => {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var exchange1 = connection.declareExchange(nextExchangeName());

      exchange1.startConsumer((message) => {
        cleanup(connection, done, new Error("Received unexpected message"));
      });
      exchange1.stopConsumer().then(() => {
        return exchange1.stopConsumer();
      }).then(() => {
        cleanup(connection, done);
      }).catch((err) => {
        cleanup(connection, done, err);
      });
    });

    it("should not generate an error when stopping a non existing Queue consumer", (done) => {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var queue = connection.declareQueue(nextQueueName());

      queue.startConsumer((message) => {
        cleanup(connection, done, new Error("Received unexpected message"));
      });

      queue.stopConsumer().then(() => {
        return queue.stopConsumer();
      }).then(() => {
        cleanup(connection, done);
      }).catch((err) => {
        cleanup(connection, done, err);
      });
    });
  });

  describe("AMQP usage", function () {
    /**
     * normal practice is to test each feature isolated.
     * This is however not very practical in this situation, because we would have to test the same features over and over
     * We will however try to identify test failures as specific as possible
     */

    it("should create a Queue with specified name", function (done) {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var queueName = nextQueueName();
      var queue = connection.declareQueue(queueName);

      connection.completeConfiguration().then(() => {
        try {
          expect(queue.name).equals(queueName);
          cleanup(connection, done);
        } catch (err) {
          cleanup(connection, done, err);
        }
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should create an Exchange with specified name and type", function (done) {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var exchangeName = nextExchangeName();
      var exchange = connection.declareExchange(exchangeName, "fanout");

      connection.completeConfiguration().then(() => {
        try {
          expect(exchange.name).equals(exchangeName);
          expect(exchange.type).equals("fanout");
          cleanup(connection, done);
        } catch (err) {
          cleanup(connection, done, err);
        }
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should create a Queue and send and receive a simple text Message", function (done) {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var queue = connection.declareQueue(nextQueueName());

      queue.activateConsumer((message) => {
        try {
          expect(message.getContent()).equals("Test");
          cleanup(connection, done);
        } catch (err) {
          cleanup(connection, done, err);
        }
      }, { noAck: true });

      connection.completeConfiguration().then(() => {
        var msg = new Amqp.Message("Test");
        queue.send(msg);
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should create a Queue and send and receive a simple text Message with ack", function (done) {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var queue = connection.declareQueue(nextQueueName());

      queue.activateConsumer((message) => {
        try {
          expect(message.getContent()).equals("Test");
          message.ack();
          cleanup(connection, done);
        } catch (err) {
          cleanup(connection, done, err);
        }
      });

      connection.completeConfiguration().then(() => {
        var msg = new Amqp.Message("Test");
        queue.send(msg);
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should create a Queue and send and receive a simple text Message with nack", function (done) {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var queue = connection.declareQueue(nextQueueName());
      var nacked = false;

      queue.activateConsumer((message) => {
        try {
          expect(message.getContent()).equals("Test");
          if (nacked) {
            message.ack();
            cleanup(connection, done);
          } else {
            message.nack();
            nacked = true;
          }
        } catch (err) {
          cleanup(connection, done, err);
        }
      });

      connection.completeConfiguration().then(() => {
        var msg = new Amqp.Message("Test");
        queue.send(msg);
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should create not resend a nack(false) message", function (done) {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var queue = connection.declareQueue(nextQueueName());
      var nacked = false;

      queue.activateConsumer((message) => {
        try {
          if (nacked) {
            expect(message.getContent()).equals("Test Finished");
            message.ack();
            cleanup(connection, done);
          } else {
            expect(message.getContent()).equals("Test");
            message.nack(false, false);
            nacked = true;
            var msg = new Amqp.Message("Test Finished");
            queue.send(msg);
          }
        } catch (err) {
          cleanup(connection, done, err);
        }
      });

      connection.completeConfiguration().then(() => {
        var msg = new Amqp.Message("Test");
        queue.send(msg);
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should create a Queue and send and receive a simple text Message with reject", function (done) {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var queue = connection.declareQueue(nextQueueName());

      queue.activateConsumer((message) => {
        try {
          expect(message.getContent()).equals("Test");
          message.reject(false);
          cleanup(connection, done);
        } catch (err) {
          cleanup(connection, done, err);
        }
      });

      connection.completeConfiguration().then(() => {
        var msg = new Amqp.Message("Test");
        queue.send(msg);
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should create a Queue and send and receive a Message with a structure", (done) => {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var queue = connection.declareQueue(nextQueueName());
      var testObj = {
        text: "Test"
      };

      queue.activateConsumer((message) => {
        try {
          expect(message.getContent()).eql(testObj);
          cleanup(connection, done);
        } catch (err) {
          cleanup(connection, done, err);
        }
      }, { noAck: true });

      connection.completeConfiguration().then(() => {
        var msg = new Amqp.Message(testObj);
        queue.send(msg);
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });


    it("should return the same Queue instance after calling connection.declareQueue multiple times", (done) => {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var queueName = nextQueueName();
      var queue1 = connection.declareQueue(queueName);
      var queue2 = connection.declareQueue(queueName);

      expect(queue1).equal(queue2);

      connection.completeConfiguration().then(() => {
        cleanup(connection, done);
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should return the same Exchange instance after calling connection.declareExchange multiple times", (done) => {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var exchangeName = nextExchangeName();
      var exchange1 = connection.declareQueue(exchangeName);
      var exchange2 = connection.declareQueue(exchangeName);

      expect(exchange2).equal(exchange2);

      connection.completeConfiguration().then(() => {
        cleanup(connection, done);
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should create an Exchange, Queue and binding and send and receive a simple string Message", (done) => {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var exchange = connection.declareExchange(nextExchangeName());
      var queue = connection.declareQueue(nextQueueName());
      queue.bind(exchange);
      queue.activateConsumer((message) => {
        try {
          expect(message.getContent()).equals("Test");
          cleanup(connection, done);
        } catch (err) {
          cleanup(connection, done, err);
        }
      }, { noAck: true });

      connection.completeConfiguration().then(() => {
        var msg = new Amqp.Message("Test");
        exchange.send(msg);
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should create an Exchange, Queue and binding and send and receive a Message with structures", (done) => {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var exchange = connection.declareExchange(nextExchangeName());
      var queue = connection.declareQueue(nextQueueName());
      var testObj = {
        text: "Test"
      };

      queue.bind(exchange);
      queue.activateConsumer((message) => {
        try {
          expect(message.getContent()).eql(testObj);
          cleanup(connection, done);
        } catch (err) {
          cleanup(connection, done, err);
        }
      }, { noAck: true });

      connection.completeConfiguration().then(() => {
        var msg = new Amqp.Message(testObj);
        exchange.send(msg);
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should create an Exchange and send and receive a simple string Message", (done) => {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var exchange = connection.declareExchange(nextExchangeName());
      exchange.activateConsumer((message) => {
        try {
          expect(message.getContent()).equals("Test");
          cleanup(connection, done);
        } catch (err) {
          cleanup(connection, done, err);
        }
      }, { noAck: true });

      connection.completeConfiguration().then(() => {
        var msg = new Amqp.Message("Test");
        exchange.send(msg);
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
      queue.activateConsumer((message) => {
        try {
          expect(message.getContent()).equals("Test");
          cleanup(connection, done);
        } catch (err) {
          cleanup(connection, done, err);
        }
      }, { noAck: true });

      connection.completeConfiguration().then(() => {
        var msg = new Amqp.Message("Test");
        exchange1.send(msg);
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should reconnect when sending a Message to an Exchange after a broken connection", (done) => {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var exchange1 = connection.declareExchange(nextExchangeName());
      var exchange2 = connection.declareExchange(nextExchangeName());
      exchange2.bind(exchange1);
      var queue = connection.declareQueue(nextQueueName());
      queue.bind(exchange2);
      queue.activateConsumer((message) => {
        try {
          expect(message.getContent()).equals("Test");
          cleanup(connection, done);
        } catch (err) {
          cleanup(connection, done, err);
        }
      }, { noAck: true }).catch((err) => {
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
            var msg = new Amqp.Message("Test");
            exchange1.send(msg);
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
      var queue = connection.declareQueue(nextQueueName());
      queue.activateConsumer((message) => {
        try {
          expect(message.getContent()).equals("Test");
          cleanup(connection, done);
        } catch (err) {
          cleanup(connection, done, err);
        }
      }, { noAck: true }).catch((err) => {
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
            var msg = new Amqp.Message("Test");
            queue.send(msg);
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
      queue.activateConsumer((message) => {
        try {
          expect(message.getContent()).equals("Test");
          exchange2.unbind(exchange1).then(() => {
            return queue.unbind(exchange2);
          }).then(() => {
            cleanup(connection, done);
          });
        } catch (err) {
          cleanup(connection, done, err);
        }
      }, { noAck: true });

      connection.completeConfiguration().then(() => {
        var msg = new Amqp.Message("Test");
        queue.send(msg);
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
      queue.activateConsumer((message) => {
        try {
          expect(message.getContent()).equals("Test");
          exchange2.delete().then(() => {
            return queue.delete();
          }).then(() => {
            cleanup(connection, done);
          });
        } catch (err) {
          cleanup(connection, done, err);
        }
      }, { noAck: true });

      connection.completeConfiguration().then(() => {
        var msg = new Amqp.Message("Test");
        queue.send(msg);
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
      queue.activateConsumer((message) => {
        cleanup(connection, done, new Error("Received unexpected message"));
      });
      queue.activateConsumer((message) => {
        cleanup(connection, done, new Error("Received unexpected message"));
      }, { noAck: true }).catch((err) => {
        expect(err.message).equal("amqp-ts Queue.activateConsumer error: consumer already defined");
        cleanup(connection, done);
      });
    });

    it("should not start 2 consumers for the same exchange", (done) => {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var exchange1 = connection.declareExchange(nextExchangeName());

      exchange1.activateConsumer((message) => {
        cleanup(connection, done, new Error("Received unexpected message"));
      });
      exchange1.activateConsumer((message) => {
        cleanup(connection, done, new Error("Received unexpected message"));
      }, { noAck: true }).catch((err) => {
        expect(err.message).equal("amqp-ts Exchange.activateConsumer error: consumer already defined");
        cleanup(connection, done);
      });
    });

    it("should stop an Exchange consumer", (done) => {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var exchange1 = connection.declareExchange(nextExchangeName());

      exchange1.activateConsumer((message) => {
        cleanup(connection, done, new Error("Received unexpected message"));
      }, { noAck: true });
      exchange1.stopConsumer().then(() => {
        cleanup(connection, done);
      });
    });

    it("should not generate an error when stopping a non existing Exchange consumer", (done) => {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var exchange1 = connection.declareExchange(nextExchangeName());

      exchange1.activateConsumer((message) => {
        cleanup(connection, done, new Error("Received unexpected message"));
      }, { noAck: true });
      exchange1.stopConsumer().then(() => {
        return exchange1.stopConsumer();
      }).then(() => {
        cleanup(connection, done);
      })
        .catch((err) => {
          cleanup(connection, done, err);
        });
    });

    it("should not generate an error when stopping a non existing Queue consumer", (done) => {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var queue = connection.declareQueue(nextQueueName());

      queue.activateConsumer((message) => {
        cleanup(connection, done, new Error("Received unexpected message"));
      }, { noAck: true });
      queue.stopConsumer().then(() => {
        return queue.stopConsumer();
      }).then(() => {
        cleanup(connection, done);
      })
        .catch((err) => {
          cleanup(connection, done, err);
        });
    });

    it("should send a message to a queue before the queue is explicitely initialized", (done) => {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var queue = connection.declareQueue(nextQueueName());
      var msg = new Amqp.Message("Test");

      queue.send(msg);

      queue.activateConsumer((message) => {
        try {
          expect(message.getContent()).equals("Test");
          cleanup(connection, done);
        } catch (err) {
          cleanup(connection, done, err);
        }
      }, { noAck: true });
    });

    it("should accept optional parameters", (done) => {
      // initialize
      var connection = getAmqpConnection();
      var messagesReceived = 0;

      // test code
      var exchange1 = connection.declareExchange(nextExchangeName(), "topic", { durable: true });
      var exchange2 = connection.declareExchange(nextExchangeName(), "topic", { durable: true });
      var queue = connection.declareQueue(nextQueueName(), { durable: true });
      queue.bind(exchange1, "*.*", {});
      exchange1.bind(exchange2, "*.test", {});

      connection.completeConfiguration().then(() => {
        var msg = new Amqp.Message("ParameterTest", {});
        exchange2.send(msg, "topic.test");
        exchange1.send(msg, "topic.test2");
        queue.send(msg);
      });

      queue.activateConsumer((message) => {
        try {
          expect(message.getContent()).equals("ParameterTest");
          messagesReceived++;
          //expect three messages
          if (messagesReceived === 3) {
            cleanup(connection, done);
          }
        } catch (err) {
          cleanup(connection, done, err);
        }
      }, { noAck: true });
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

    it("should delete an exchange and a queue", function (done) {
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

    it("should process a queue rpc", function (done) {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var queue = connection.declareQueue(nextQueueName());

      queue.activateConsumer((message) => {
        return message.getContent().reply;
      });

      connection.completeConfiguration().then(function () {
        queue.rpc({ reply: "TestRpc" }).then((result) => {
          try {
            expect(result.getContent()).equals("TestRpc");
            cleanup(connection, done);
          } catch (err) {
            cleanup(connection, done, err);
          }
        });
      });
    });

    it("should process an unresolved queue rpc, consumer returning Message", function (done) {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var queue = connection.declareQueue(nextQueueName());

      queue.activateConsumer((message) => {
        return new Amqp.Message(message.getContent().reply);
      });

      queue.rpc({ reply: "TestRpc" }).then((result) => {
        try {
          expect(result.getContent()).equals("TestRpc");
          cleanup(connection, done);
        } catch (err) {
          cleanup(connection, done, err);
        }
      });
    });

    it("should process a queue rpc, consumer returning Promise", function (done) {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var queue = connection.declareQueue(nextQueueName());

      queue.activateConsumer((message) => {
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            resolve(message.getContent().reply);
          }, 10);
        });
      });

      connection.completeConfiguration().then(function () {
        queue.rpc({ reply: "TestRpc" }).then((result) => {
          try {
            expect(result.getContent()).equals("TestRpc");
            cleanup(connection, done);
          } catch (err) {
            cleanup(connection, done, err);
          }
        });
      });
    });

    it("should process an exchange rpc", function (done) {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var exchange = connection.declareExchange(nextExchangeName());

      exchange.activateConsumer((message) => {
        return message.getContent().reply;
      });

      connection.completeConfiguration().then(function () {
        exchange.rpc({ reply: "TestRpc" }).then((result) => {
          try {
            expect(result.getContent()).equals("TestRpc");
            cleanup(connection, done);
          } catch (err) {
            cleanup(connection, done, err);
          }
        });
      });
    });

    it("should create a topology and send and receive a Message", function (done) {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var exchangeName1 = nextExchangeName();
      var exchangeName2 = nextExchangeName();
      var queueName1 = nextQueueName();
      var topology: Amqp.Connection.Topology = {
        exchanges: [
          { name: exchangeName1 },
          { name: exchangeName2 }
        ],
        queues: [
          { name: queueName1 }
        ],
        bindings: [
          { source: exchangeName1, exchange: exchangeName2 },
          { source: exchangeName2, queue: queueName1 }
        ]
      };

      connection.declareTopology(topology).then(function () {
        var queue = connection.declareQueue(queueName1);
        queue.activateConsumer((message) => {
          expect(message.getContent()).equals("Test");
          cleanup(connection, done);
        }, { noAck: true });

        var exchange = connection.declareExchange(exchangeName1);
        var msg = new Amqp.Message("Test");
        exchange.send(msg);
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should close a queue multiple times without generating errors", function (done) {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var queueName = nextQueueName();
      var queue = connection.declareQueue(queueName);

      connection.completeConfiguration().then(function () {
        queue.close();
        queue.close().then(() => {
          // redeclare queue for correct cleanup
          queue = connection.declareQueue(queueName);
          queue.initialized.then(() => {
            cleanup(connection, done);
          });
        });
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should delete a queue multiple times without generating errors", function (done) {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var queueName = nextQueueName();
      var queue = connection.declareQueue(queueName);

      connection.completeConfiguration().then(function () {
        queue.delete();
        queue.delete().then(() => {
          cleanup(connection, done);
        });
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should close an exchange multiple times without generating errors", function (done) {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var exchangeName = nextExchangeName();
      var exchange = connection.declareExchange(exchangeName);

      connection.completeConfiguration().then(function () {
        exchange.close();
        exchange.close().then(() => {
          // redeclare exchange for correct cleanup
          exchange = connection.declareExchange(exchangeName);
          exchange.initialized.then(() => {
            cleanup(connection, done);
          });
        });
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should delete an exchange multiple times without generating errors", function (done) {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var exchangeName = nextExchangeName();
      var exchange = connection.declareExchange(exchangeName);

      connection.completeConfiguration().then(function () {
        exchange.delete();
        exchange.delete().then(() => {
          cleanup(connection, done);
        });
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should set a prefetch count to a queue", function (done) {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var queueName = nextQueueName();
      var queue = connection.declareQueue(queueName);

      connection.completeConfiguration().then(function () {
        // todo: create a ral test that checks if the function works
        queue.prefetch(3);
        cleanup(connection, done);
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should recover to a queue", function (done) {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var queueName = nextQueueName();
      var queue = connection.declareQueue(queueName);

      connection.completeConfiguration().then(function () {
        // todo: create a real test that checks if the function works
        queue.recover().then(() => {
          cleanup(connection, done);
        });
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should not connect to a nonexisiting queue with 'noCreate: true'", function (done) {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var queueName = nextQueueName();
      connection.declareQueue(queueName, { noCreate: true });

      connection.completeConfiguration()
        .then(() => {
          cleanup(connection, done, new Error("Unexpected existing queue"));
        })
        .catch((err) => {
          expect(err.message).to.contain("NOT-FOUND");
          cleanup(connection, done);
        });
    });

    it("should connect to an exisiting queue with 'noCreate: true'", function (done) {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var queueName = nextQueueName();
      connection.declareQueue(queueName);

      connection.completeConfiguration()
        .then(() => {
          var queue = connection.declareQueue(queueName, { noCreate: true });
          queue.initialized
            .then(() => {
              cleanup(connection, done);
            })
            .catch((err) => {
              cleanup(connection, done, err);
            });
        });
    });

    it("should not connect to a nonexisiting exchange with 'noCreate: true'", function (done) {
      // initialize
      var connection = getAmqpConnection();

      // test code
      var exchangeName = nextExchangeName();
      connection.declareExchange(exchangeName, "", { noCreate: true });

      connection.completeConfiguration()
        .then(() => {
          cleanup(connection, done, new Error("Unexpected existing exchange: " + exchangeName));
        })
        .catch((err) => {
          expect(err.message).to.contain("NOT-FOUND");
          cleanup(connection, done);
        });
    });

    it("should connect to an exisiting exchange with 'noCreate: true'", function (done) {
      // initialize
      var connection = getAmqpConnection();

      var exchangeName = nextExchangeName();
      AmqpLib.connect(ConnectionUrl)
        .then((conn) => {
          return conn.createChannel();
        })
        .then((ch) => {
          return ch.assertExchange(exchangeName, "fanout");
        })
        .then(() => {
          var exchange = connection.declareExchange(exchangeName, "", { noCreate: true });
          exchange.initialized
            .then(() => {
              cleanup(connection, done);
            })
            .catch((err) => {
              cleanup(connection, done, err);
            });
        })
        .catch((err) => {
          done(err);
        });
    });
  });
});
