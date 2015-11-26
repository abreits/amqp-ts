/**
 * Integration tests for AmqpSimple
 * Created by Ab on 2015-10-21.
 */
import * as Chai from "chai";
var expect = Chai.expect;

import * as Amqp from "../lib/amqp-ts";

/**
 * Test using a local rabbitmq instance
 */
// define test defaults
var ConnectionUrl = process.env.AMQPTEST_CONNECTION_URL || "amqp://localhost";
var UnitTestLongTimeout = process.env.AMQPTEST_LONG_TIMEOUT || 60000;
var LogLevel = process.env.AMQPTEST_LOGLEVEL || "warn";

// set logging level
var winston = Amqp.log;
winston.transports.console.level = LogLevel;

// needed for server restart tests
var os = require("os");
var isWin = /^win/.test(os.platform());
var path = require("path");
var cp = require("child_process");

/* istanbul ignore next */
function restartAmqpServer() {
  "use strict";
  // windows only code
  console.log("shutdown and restart rabbitmq");
  if (isWin) {
    try {
      cp.execSync("net stop rabbitmq");
      cp.exec("net start rabbitmq");
    } catch (err) {
      winston.log("error", "Unable to shutdown and restart RabbitMQ, possible solution: use elevated permissions (start an admin shell)");
      throw (new Error("Unable to restart rabbitmq, error:\n" + err.message));
    }
  } else {
    throw (new Error("AmqpServer shutdown and restart not implemented for this platform"));
  }
}

/* istanbul ignore next */
describe("AMQP Connection class automatic reconnection", function() {
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

  this.timeout(UnitTestLongTimeout); // define long timeout for rabbitmq service restart
  it("should reconnect a queue when detecting a broken connection because of a server restart", (done) => {
    // initialize
    var connection = new Amqp.Connection(ConnectionUrl);

    // test code
    var queue = connection.declareQueue("TestQueue");
    queue.activateConsumer((message) => {
      try {
        expect(message.getContent()).equals("Test");
        cleanup(connection, done);
      } catch (err) {
        cleanup(connection, done, err);
      }
    }, {noAck: true}).then(() => {
      restartAmqpServer();
      setTimeout(() => {
        var msg = new Amqp.Message("Test");
        queue.send(msg);
      }, 1000);
    }).catch((err) => {
      console.log("Consumer intialization FAILED!!!");
      done(err);
    });
  });

  it("should reconnect and rebuild a complete configuration when detecting a broken connection because of a server restart", (done) => {
    // initialize
    var connection = new Amqp.Connection(ConnectionUrl);

    // test code
    var exchange1 = connection.declareExchange("TestExchange1");
    var exchange2 = connection.declareExchange("TestExchange2");
    var queue = connection.declareQueue("TestQueue");
    exchange2.bind(exchange1);
    queue.bind(exchange2);
    queue.activateConsumer((message) => {
      try {
        expect(message.getContent()).equals("Test");
        cleanup(connection, done);
      } catch (err) {
        cleanup(connection, done, err);
      }
    }, {noAck: true}).then(() => {
      restartAmqpServer();
      setTimeout(() => {
        var msg = new Amqp.Message("Test");
        queue.send(msg);
      }, 1000);
    }).catch((err) => {
      console.log("Consumer intialization FAILED!!!");
      done(err);
    });
  });
});
