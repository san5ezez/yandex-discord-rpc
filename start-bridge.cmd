@echo off
cd /d "%~dp0bridge"
start "Yandex Music Discord RPC" /min "%ProgramFiles%\nodejs\node.exe" start.js
