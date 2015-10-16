/*
 * module to get messages from a queue and place them in a set of files
 *
 */

var Amq = require('amq');
var fs = require('fs');
var path = require('path');
var os = require('os');
var EOL = os.EOL;

// settings
var leechPeriod = 0; // listen period in ms, forever if 0
var fileSplitInterval = 60000; // period after which to start a new file
var logFolder = './test_messages'; // optional folder to place the log files in
//var serverUrl = '10.133.5.160';

var serverUrl = 'espel';
var exchangeName = 'metadata';

var exchangeOptions = {
  type: 'fanout',
  autoDelete: false,
  durable: true
};

// code
var writeStream = null;
var baseFileName;
if(logFolder) {
  //make sure the folder exists
  baseFileName = path.resolve(path.dirname(__filename), logFolder)
  fs.mkdir(baseFileName, function(e){
    if(e && e.code != 'EEXIST'){
      //debug
      console.log(e);
    }
  });
  baseFileName = path.resolve(baseFileName, exchangeName);
} else {
  baseFileName = exchangeName;
}

// connect to exchange and log to file
var connection = Amq.createConnection({
    host: serverUrl,
    debug: true
  }, {
    reconnect: { strategy: 'constant', initial: 1000 }
  }
);

var queue = connection.queue('', {exclusive: true});
var exchange = connection.exchange(exchangeName, exchangeOptions);
queue.bind(exchange);
queue.consume(function (message) {
  if(message) {
    var payload = message.content.toString();
    log(payload);
    queue.ack(message);
  }
});

function log (data) {
  if(!writeStream) {
    // create a new writestream
    var now = new Date();
    fullFileName = baseFileName + '_' + Number(now) + '.json';
    writeStream = fs.createWriteStream(fullFileName);
    console.log('created file:' + fullFileName);
  }
  writeStream.write(Date.now() + ':' + data + EOL);
}

function splitInterval() {
  if(writeStream !== null) {
    writeStream.end();
    writeStream = null;
  } else {
    console.log('no messages written during this interval!');
  }

  splitTimeout = setTimeout(splitInterval, fileSplitInterval);
}
var splitTimeout = setTimeout(splitInterval, fileSplitInterval);


function endLeech() {
  // close everything
  connection.close().then(function() {
    clearTimeout(splitTimeout);
    writeStream.end();
    writeStream = null;
    writeStream.on('finish', function() {
      process.exit(0); // kill the process, amq seems to keep it running, despite the connection being closed
    });
  });
}

if(leechPeriod>0) {
  setTimeout(endLeech, leechPeriod);
}
