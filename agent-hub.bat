@echo off
setlocal
cd /d "%~dp0"

node "%~dp0scripts\build.mjs" %*
exit /b %errorlevel%
