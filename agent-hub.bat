@echo off
setlocal
cd /d "%~dp0"

node "%~dp0scripts\app\build.mjs" %*
exit /b %errorlevel%
