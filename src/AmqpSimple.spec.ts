/**
 * Tests for AmqpSimple
 * Created by Ab on 16-9-2015.
 */
import * as winston from "winston";
import * as Chai from "chai";
var expect = Chai.expect;

import {AmqpSimple as Amqp} from "../lib/amqp-ts";

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
describe("Test AmqpSimple module", function() {
  this.timeout(UnitTestTimeout); // define default timeout

  // cleanup function for the AMQP connection, also tests the Connection.deleteConfiguration method
  function cleanup(connection, done) {
    connection.deleteConfiguration().then(() => {
      return connection.close();
    }).then(() => {
      done();
    }, (err) => {
      done(err);
    });
  }

  describe("AMQP Connection class initialization", () => {
    it("should create a RabbitMQ connection", (done) => {
      // test code
      var connection = new Amqp.Connection(ConnectionUrl);
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

  describe("AMQP usage", () => {
    /**
     * normal practice is to test each feature isolated.
     * This is however not very practical in this situation, because we would have to test the same features over and over
     * We will however try to identify test failures as specific as possible
     */
    it("should create a Queue and send and receive simple string messages", (done) => {
      // initialize
      var connection = new Amqp.Connection(ConnectionUrl);

      // test code
      var queue = connection.declareQueue("TestQueue");

      queue.startConsumer((message) => {
        expect(message).equals("Test");
        cleanup(connection, done);
      });

      connection.completeConfiguration().then(() => {
        queue.publish("Test");
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should create a Queue and send and receive simple string objects", (done) => {
      // initialize
      var connection = new Amqp.Connection(ConnectionUrl);

      // test code
      var queue = connection.declareQueue("TestQueue");
      var testObj = {
        text: "Test"
      };

      queue.startConsumer((message) => {
        expect(message).eql(testObj);
        cleanup(connection, done);
      });

      connection.completeConfiguration().then(() => {
        queue.publish(testObj);
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should create an Exchange, Queue and binding and send and receive simple string messages", (done) => {
      // initialize
      var connection = new Amqp.Connection(ConnectionUrl);

      // test code
      var exchange = connection.declareExchange("TestExchange");
      var queue = connection.declareQueue("TestQueue");
      queue.bind(exchange);
      queue.startConsumer((message) => {
        expect(message).equals("Test");
        cleanup(connection, done);
      });

      connection.completeConfiguration().then(() => {
        exchange.publish("Test");
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should create an Exchange, Queue and binding and send and receive objects", (done) => {
      // initialize
      var connection = new Amqp.Connection(ConnectionUrl);

      // test code
      var exchange = connection.declareExchange("TestExchange");
      var queue = connection.declareQueue("TestQueue");
      var testObj = {
        text: "Test"
      };

      queue.bind(exchange);
      queue.startConsumer((message) => {
        expect(message).eql(testObj);
        cleanup(connection, done);
      });

      connection.completeConfiguration().then(() => {
        exchange.publish(testObj);
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should create an Exchange and send and receive simple string messages", (done) => {
      // initialize
      var connection = new Amqp.Connection(ConnectionUrl);

      // test code
      var exchange = connection.declareExchange("TestExchange");
      exchange.startConsumer((message) => {
        expect(message).equals("Test");
        cleanup(connection, done);
      });

      connection.completeConfiguration().then(() => {
        exchange.publish("Test");
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should bind Exchanges", (done) => {
      // initialize
      var connection = new Amqp.Connection(ConnectionUrl);

      // test code
      var exchange1 = connection.declareExchange("TestExchange1");
      var exchange2 = connection.declareExchange("TestExchange2");
      var queue = connection.declareQueue("TestQueue");

      exchange2.bind(exchange1);
      queue.bind(exchange2);
      queue.startConsumer((message) => {
        expect(message).eql("Test");
        cleanup(connection, done);
      });

      connection.completeConfiguration().then(() => {
        exchange1.publish("Test");
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should reconnect when sending a message to an Exchange after a broken connection", (done) => {
      // initialize
      var connection = new Amqp.Connection(ConnectionUrl);

      // test code
      var exchange1 = connection.declareExchange("TestExchange1");
      var exchange2 = connection.declareExchange("TestExchange1");
      exchange2.bind(exchange1);
      var queue = connection.declareQueue("TestQueue");
      queue.bind(exchange2);
      queue.startConsumer((message) => {
        expect(message).equals("Test");
        cleanup(connection, done);
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
      var connection = new Amqp.Connection(ConnectionUrl);

      // test code
      // var exchange1 = connection.declareExchange("TestExchange1");
      // var exchange2 = connection.declareExchange("TestExchange1");
      // exchange2.bind(exchange1);
      var queue = connection.declareQueue("TestQueue");
      //queue.bind(exchange1);
      queue.startConsumer((message) => {
        expect(message).equals("Test");
        cleanup(connection, done);
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
      var connection = new Amqp.Connection(ConnectionUrl);

      // test code
      var exchange1 = connection.declareExchange("TestExchange1");
      var exchange2 = connection.declareExchange("TestExchange2");
      var queue = connection.declareQueue("TestQueue");

      exchange2.bind(exchange1);
      queue.bind(exchange2);
      queue.startConsumer((message) => {
        expect(message).eql("Test");
        exchange2.unbind(exchange1).then(() => {
          return queue.unbind(exchange2);
        }).then(() => {
          cleanup(connection, done);
        });
      });

      connection.completeConfiguration().then(() => {
        exchange1.publish("Test");
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should delete Exchanges and Queues", (done) => {
      // initialize
      var connection = new Amqp.Connection(ConnectionUrl);

      // test code
      var exchange1 = connection.declareExchange("TestExchange1");
      var exchange2 = connection.declareExchange("TestExchange2");
      var queue = connection.declareQueue("TestQueue");

      exchange2.bind(exchange1);
      queue.bind(exchange2);
      queue.startConsumer((message) => {
        expect(message).eql("Test");
        exchange2.delete().then(() => {
          return queue.delete();
        }).then(() => {
          cleanup(connection, done);
        });
      });

      connection.completeConfiguration().then(() => {
        exchange1.publish("Test");
      }, (err) => { // failed to configure the defined topology
        done(err);
      });
    });

    it("should not start 2 consumers for the same queue", (done) => {
      // initialize
      var connection = new Amqp.Connection(ConnectionUrl);

      // test code
      var exchange1 = connection.declareExchange("TestExchange1");
      var queue = connection.declareQueue("TestQueue");

      queue.bind(exchange1);
      queue.startConsumer((message) => {
        done(new Error("Received unexpected message"));
      });
      queue.startConsumer((message) => {
        done(new Error("Received unexpected message"));
      }).catch((err) => {
        expect(err.message).equal("AMQP Queue.startConsumer error: consumer already defined");
        cleanup(connection, done);
      });
    });

    it("should not start 2 consumers for the same exchange", (done) => {
      // initialize
      var connection = new Amqp.Connection(ConnectionUrl);

      // test code
      var exchange1 = connection.declareExchange("TestExchange1");

      exchange1.startConsumer((message) => {
        done(new Error("Received unexpected message"));
      });
      exchange1.startConsumer((message) => {
        done(new Error("Received unexpected message"));
      }).catch((err) => {
        expect(err.message).equal("AMQP Exchange.startConsumer error: consumer already defined");
        cleanup(connection, done);
      });
    });

    it("should stop an Exchange consumer", (done) => {
      // initialize
      var connection = new Amqp.Connection(ConnectionUrl);

      // test code
      var exchange1 = connection.declareExchange("TestExchange1");

      exchange1.startConsumer((message) => {
        done(new Error("Received unexpected message"));
      });
      exchange1.stopConsumer().then(() => {
        cleanup(connection, done);
      });
    });

    it("should generate an error when stopping a non existing Exchange consumer", (done) => {
      // initialize
      var connection = new Amqp.Connection(ConnectionUrl);

      // test code
      var exchange1 = connection.declareExchange("TestExchange1");

      exchange1.startConsumer((message) => {
        done(new Error("Received unexpected message"));
      });
      exchange1.stopConsumer().then(() => {
        return exchange1.stopConsumer();
      }).catch((err) => {
        expect(err.message).equals("AMQP Exchange.cancelConsumer error: no consumer defined");
        cleanup(connection, done);
      });
    });

    it("should generate an error when stopping a non existing Queue consumer", (done) => {
      // initialize
      var connection = new Amqp.Connection(ConnectionUrl);

      // test code
      var queue = connection.declareQueue("TestQueue");

      queue.startConsumer((message) => {
        done(new Error("Received unexpected message"));
      });
      queue.stopConsumer().then(() => {
        return queue.stopConsumer();
      }).catch((err) => {
        expect(err.message).equals("AMQP Queue.cancelConsumer error: no consumer defined");
        cleanup(connection, done);
      });
    });

    it("should send a message to a queue before the queue is explicitely initialized", (done) => {
      // initialize
      var connection = new Amqp.Connection(ConnectionUrl);

      // test code
      var queue = connection.declareQueue("TestQueue");

      queue.publish("Test");

      queue.startConsumer((message) => {
        expect(message).equals("Test");
        cleanup(connection, done);
      });
    });
  });
});
