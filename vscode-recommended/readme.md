Recommended Visual Studio Code settings
=======================================

If you copy _launch.json_ and _tasks.json_ to the _.vscode_ folder, you get the following features:
- remote build on the docker image triggered by CTRL-SHIFT-B (the default build shortcut)
- remote debug task available for debugging the mocha tests on the docker image. Type CTRL-SHIFT-P 'run', select 'run tasks', then select 'debug'. You can now run the 'Attach' debugger in Visual Studio Code to start debugging.