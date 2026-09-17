@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode
node tools\server.cjs --open index.html
goto end
:nonode
echo Node.js is required. Install it from https://nodejs.org and run this file again.
pause
:end
