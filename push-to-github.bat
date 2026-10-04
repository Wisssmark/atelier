@echo off
cd /d "%~dp0"
title Push Atelier to GitHub
echo ==================================================
echo   Uploading Atelier to GitHub
echo ==================================================
echo.
echo If a GitHub sign-in window pops up, approve it so the upload can finish.
echo.
where git >nul 2>nul
if errorlevel 1 (
  echo *** Git is not installed. Install it from https://git-scm.com/download/win then run this again. ***
  pause
  exit /b 1
)
git init
git add -A
git -c user.email="wisss1970@gmail.com" -c user.name="Wissam Hamati" commit -m "Atelier portfolio site"
git branch -M main
git remote remove origin 2>nul
git remote add origin https://github.com/Wisssmark/atelier.git
git push -u origin main
echo.
if errorlevel 1 (echo *** Push failed - tell Claude what the message above says. ***) else (echo *** DONE! Your files are now on GitHub. You can close this window. ***)
pause
