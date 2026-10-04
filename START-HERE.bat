@echo off
cd /d "%~dp0"
title Atelier Server
echo ==================================================
echo   ATELIER
echo ==================================================
echo.
REM Install dependencies only if missing (fast restarts after first run)
if not exist node_modules (
  echo First run: installing dependencies. This takes about a minute...
  call npm install
  if errorlevel 1 (
    echo.
    echo *** Install failed. Make sure Node.js is installed ^(nodejs.org^), then run this again. ***
    pause
    exit /b 1
  )
)
echo.
echo Starting the server...
echo Keep THIS window open, then open your browser to:  http://localhost:4000
echo ^(Press Ctrl+C here to stop the site.^)
echo.
call npm start
echo.
echo *** The server stopped. If it said "EADDRINUSE", another copy is already
echo *** running - just open http://localhost:4000 in your browser.
pause
