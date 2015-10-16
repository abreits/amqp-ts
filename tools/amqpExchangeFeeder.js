/*
 * module to create a test typed raw json ship stream and send it to a rabbitMq exchange
 *
 */

var fs = require('fs');
var path = require('path');
var lineReader = require('line-reader');

// settings
var logFolder = './test_messages'; // folder containing the log files
var roundRobin = false; // loop data
var realTime = true; // send messages the same rate as they were originally sent

var Amq = require('amq');


// local libraries required
var settings = {
  connectionUrl: 'espel',
  socketOptions: {},

  exchange: 'raptor.sigfox.data',
  exchangeOptions: {
    type: 'fanout',
    autoDelete: false,
    durable: true
  }
};

var connection = Amq.createConnection({
    host: settings.connectionUrl,
    debug: true
  }, {
    reconnect: { strategy: 'constant', initial: 1000 }
  }
);

var exchange = connection.exchange(settings.exchange, settings.exchangeOptions);

// get all files in the data folder
var dataFolder = path.resolve(path.dirname(__filename), logFolder);
var files = fs.readdirSync(dataFolder).sort();
var fileIndex = 0;
var msgCount = 0;

var startTimeOffset = null;

function processLogFile() {
  var dataFile = path.resolve(dataFolder, files[fileIndex]);
  console.log(new Date() + ' - sending file: ' + dataFile);
  lineReader.open(dataFile, processRestOfFile);
}

function processNextLogFile() {
  // close processing of the current file?
  // process the next file
  fileIndex++;
  if (fileIndex >= files.length) {
    if (roundRobin) {
      fileIndex = 0;
      startTimeOffset = null;
    } else {
      console.log('finished');
      connection.close().then(function() {
        process.exit(0); // kill the process, amq seems to keep it running, despite the connection being closed
      });
      return;
    }
  }
  processLogFile();
}

function processRestOfFile(reader) {
  // function that sends the current line to the exchange and reads the next line
  function publishLineAndProcessRestOfFile(line) {
    // content options appear to be needed in esper
    exchange.publish('', line, {
          contentEncoding: 'UTF-8',
          contentType: 'application/json',
          headers: {
            __TypeId__: 'nl.klpd.dsrt.model.ivef.v0_2.dto.MSG_IVEF'
          }
        }
    );
    processRestOfFile(reader);
  }

  function processLineAndRestOfFile(line) {
    if(realTime) {
      var split = 0;
      var msgTime;
      try {
        split = line.indexOf(':');

        msgTime = Number(line.slice(0, split));
        line = line.substr(split + 1);
        //msgTime = msg.body.objectDatas.objectData[0].trackData.updateTime;
      }
      catch (e) {
        console.log('ERROR: ' + e);
        return callback();
      }

      if(startTimeOffset === null) {
        // compute startTime offset
        var now = Number(new Date());
        startTimeOffset = now - msgTime;
      }

      var now = Date.now();
      var sendTime = msgTime + startTimeOffset;
      var offset = sendTime - now;

      if(Date.now() >= msgTime + startTimeOffset) {
        // send now
        publishLineAndProcessRestOfFile(line);
      } else {
        // send later
        setTimeout(publishLineAndProcessRestOfFile, msgTime + startTimeOffset - Date.now(), line);
      }
    } else {
      // send now
      publishLineAndProcessRestOfFile(line);
    }
  }

  if(reader.hasNextLine()) {
    msgCount++;
    reader.nextLine(processLineAndRestOfFile);
  } else {
    console.log('File completed, messages sent so far: ' + msgCount);
    processNextLogFile();
  }
}

//start processing
setTimeout(processLogFile, 1000);
//processLogFile();
