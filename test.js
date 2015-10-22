// needed for server restart tests
var os = require("os");
var isWin = /^win/.test(os.platform());
var path = require("path");
var cp = require("child_process");

function killAndRestartAmqpServer() {
  "use strict";

  function getPid(serviceName) {
    var result = cp.execSync("sc queryex " + serviceName).toString();
    console.log(result);
    var regex = /pid*\s*\s.*\s[0-9]+/gi;
    pid = result.match(regex)[0].match(/[0-9]+/);
    return pid[0];
  }

  // windows only code
  console.log("kill and restart rabbitmq");
  if (isWin) {
    try {
      var pid = getPid("rabbitmq");
      console.log("pid: [" + pid + "]");
      //cp.execSync("taskkill /f /pid " + pid);
      //cp.exec("net start rabbitmq");
    } catch (err) {
      //winston.log("error", "Unable to kill and restart RabbitMQ, possible solution: use elevated permissions (start an admin shell)");
      throw (new Error("Unable to restart rabbitmq, error:\n" + err.message));
    }
  } else {
    throw (new Error("AmqpServer kill and restart not implemented for this platform"));
  }
}

killAndRestartAmqpServer()