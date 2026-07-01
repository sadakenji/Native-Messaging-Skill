@echo off
rem Launcher invoked by Chrome. Native Messaging manifest "path" points here.
rem Chrome cannot launch a .js directly on Windows, so this batch wraps node.
node "%~dp0host.js" %*
