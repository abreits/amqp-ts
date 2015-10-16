/**
 * install.js - node.js platform independent installer for the project
 */

module.exports = function(callback) {
// use which to check if commands are available and to circumvent a bug in windows child_process.sync
  var which = require('./which.js');
//get full path to command (and check if the command exists)
  function getCommand(cmd) {
    try {
      return which.sync(cmd);
    }
    catch (err) {
      console.log('ERROR: command [' + cmd + '] not found\n' +
        '    make sure the node-gyp and node-oracledb prerequisites have been installed, see:\n' +
        '        https://github.com/TooTallNate/node-gyp\n' +
        '        https://github.com/oracle/node-oracledb\n' +
        '    execute the following command to install all prerequisites:\n' +
        '        WINDOWS:        > npm install -g gulp\n' +
        '        Mac and Linux:  > sudo npm install -g gulp\n');
      process.exit(1);
    }
  }

  var cmdNpm = getCommand('npm');
  var cmdGulp = getCommand('gulp');

  var spawn = require('child_process').spawn;

  var gulpOptions = ['build'];

  commands = [
    { cmd: cmdNpm, options: ['install'], cwd: '.' },
    { cmd: cmdGulp, options: gulpOptions, cwd: '.' }
  ];

  function processCommands(commands) {
    if (commands.length > 0) {
      var cmd = spawn(commands[0].cmd, commands[0].options, {cwd: commands[0].cwd, stdio: 'inherit'});
      cmd.on('close', function (code) {
        console.log('child process exited with code ' + code);
        // call next command
        if (code == 0) {
          commands.shift();
          processCommands(commands)
        }
      })
    } else {
      if (callback) callback();
    }
  }

  processCommands(commands);
};



