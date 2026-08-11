@echo off
setlocal
set "APP=%~dp0Astronomy Companion.html"
set "URL=file:///%APP:\=/%"

where msedge.exe >nul 2>nul
if %errorlevel%==0 (
  start "" msedge.exe --app="%URL%" --start-maximized
  exit /b 0
)

if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app="%URL%" --start-maximized
  exit /b 0
)

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app="%URL%" --start-maximized
  exit /b 0
)

start "" "%APP%"
