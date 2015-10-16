/**
 * app.js - main starter file, starts server
 * and if that does not work tries to install all dependencies, build application and try again
 *
 * Created by Ab on 1-8-2014.
 */

// start the server
function retryStartServer() {
  try {
    console.log('\n\n********* Trying to start server again');
    require('./generated_js/r2db.js');
  }
  catch (e) {
    console.log('ERROR: Could not start server');
    console.log(e.stack);
  }
}

var serverStarted;
try {
  require('./generated_js/r2db.js');
  serverStarted = true;
}
catch (e) {
  serverStarted = false;
}

if (!serverStarted) {
  console.log('Server not available, (re)building dependencies and application!');
  require('./tools/lib/install')(retryStartServer);
}




