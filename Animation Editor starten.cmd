@echo off
setlocal
cd /d "%~dp0"

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo Node.js/npm wurde nicht gefunden.
  echo Bitte installiere Node.js und starte diese Datei danach nochmal.
  pause
  exit /b 1
)

if not exist "node_modules\electron" (
  echo Installiere Abhaengigkeiten...
  call npm.cmd install
  if errorlevel 1 (
    echo Installation fehlgeschlagen.
    pause
    exit /b 1
  )
)

call npm.cmd run editor
if errorlevel 1 (
  echo.
  echo Editor konnte nicht gestartet werden.
  pause
  exit /b 1
)

endlocal
