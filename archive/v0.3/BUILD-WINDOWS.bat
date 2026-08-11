@echo off
setlocal
cd /d "%~dp0"

echo Astronomy Companion v0.3 - Windows Tauri Build

echo Checking Node...
where node >nul 2>nul || goto :missing_node

echo Checking Rust...
where cargo >nul 2>nul || goto :missing_rust

echo Installing JavaScript dependencies...
call npm install || goto :failed

echo Building Windows installer...
call npm run tauri build || goto :failed

echo.
echo Build complete. Check src-tauri\target\release\bundle\nsis\
pause
exit /b 0

:missing_node
echo.
echo Node.js was not found. Install the current Node.js LTS release first.
pause
exit /b 1

:missing_rust
echo.
echo Rust/Cargo was not found. Install the Tauri Windows prerequisites first.
echo See README.md for the build workflow.
pause
exit /b 1

:failed
echo.
echo The build stopped because a command failed. Review the message above.
pause
exit /b 1
