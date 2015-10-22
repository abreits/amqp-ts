/**
 * Integration tests for AmqpSimple
 * Created by Ab on 2015-10-21.
 */
import * as winston from "winston";
import * as Chai from "chai";
var expect = Chai.expect;

import {AmqpSimple as Amqp} from "../lib/amqp-ts";

/**
 * Test using a local rabbitmq instance
 */
// define test defaults
var ConnectionUrl = process.env.AMQPTEST_CONNECTION_URL || "amqp://localhost";
var UnitTestTimeout = process.env.AMQPTEST_TIMEOUT || 1000;
var LogLevel = process.env.AMQPTEST_LOGLEVEL || "warn";

// set logging level
winston.level = LogLevel;

// cleanup function for the AMQP connection, also tests the Connection.deleteConfiguration method
/* istanbul ignore next */
function cleanup(connection, done) {
  "use strict";
  connection.deleteConfiguration().then(() => {
    return connection.close();
  }).then(() => {
    done();
  }, (err) => {
    done(err);
  });
}

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

// killing works, restarting unfortunately not yet (the service will not start unless a reboot takes place)
/* istanbul ignore next */
// function killAndRestartAmqpServer() {
//   "use strict";

//   function getPid(serviceName): string {
//     var result = cp.execSync("sc queryex " + serviceName).toString();
//     console.log(result);
//     var regex = /pid*\s*\s.*\s[0-9]+/gi;
//     pid = result.match(regex)[0].match(/[0-9]+/);
//     return pid[0];
//   }

//   // windows only code
//   console.log("kill and restart rabbitmq");
//   if (isWin) {
//     try {
//       var pid = getPid("rabbitmq");
//       console.log("execute: taskkill /f /pid " + pid);
//       console.log(cp.execSync("taskkill /f /pid " + pid).toString());
//       cp.exec("net start rabbitmq");
//     } catch (err) {
//       winston.log("error", "Unable to kill and restart RabbitMQ, possible solution: use elevated permissions (start an admin shell)");
//       throw (new Error("Unable to restart rabbitmq, error:\n" + err.message));
//     }
//   } else {
//     throw (new Error("AmqpServer kill and restart not implemented for this platform"));
//   }
// }

/* istanbul ignore next */
describe("Test AmqpSimple module", function() {
  this.timeout(UnitTestTimeout); // define default timeout



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

describe("AMQP Connection class automatic reconnection", function() {
  this.timeout(60000); // define long timeout for rabbitmq service restart
  it("should reconnect a queue when detecting a broken connection because of a server restart", (done) => {
    // initialize
    var connection = new Amqp.Connection(ConnectionUrl);

    // test code
    var queue = connection.declareQueue("TestQueue");
    queue.startConsumer((message) => {
      expect(message).equals("Test");
      cleanup(connection, done);
    }).then(() => {
      restartAmqpServer();
      setTimeout(() => {
        queue.publish("Test");
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
    queue.startConsumer((message) => {
      expect(message).equals("Test");
      cleanup(connection, done);
    }).then(() => {
      restartAmqpServer();
      setTimeout(() => {
        exchange1.publish("Test");
      }, 1000);
    }).catch((err) => {
      console.log("Consumer intialization FAILED!!!");
      done(err);
    });
  });

  // // kill and restart server does not work for now
  // it("should reconnect a queue when detecting a broken connection because of a server ungracefull shutdown and restart", (done) => {
  //   // initialize
  //   var connection = new Amqp.Connection(ConnectionUrl);

  //   // test code
  //   var queue = connection.declareQueue("TestQueue");
  //   queue.startConsumer((message) => {
  //     expect(message).equals("Test");
  //     cleanup(connection, done);
  //   }).then(() => {
  //     killAndRestartAmqpServer();
  //     setTimeout(() => {
  //       queue.publish("Test");
  //     }, 1000);
  //   }).catch((err) => {
  //     console.log("Consumer intialization FAILED!!!");
  //     done(err);
  //   });
  // });
});
