@echo off
setlocal
set "TARGET=%~dp0Launch Astronomy Companion.bat"
set "WORKDIR=%~dp0"
set "SHORTCUT=%USERPROFILE%\Desktop\Astronomy Companion.lnk"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws=New-Object -ComObject WScript.Shell; $s=$ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath='%TARGET%'; $s.WorkingDirectory='%WORKDIR%'; $s.Description='Astronomy Companion v0.3'; $s.Save()"
if exist "%SHORTCUT%" (
  echo Desktop shortcut created.
) else (
  echo Could not create the shortcut.
)
pause
