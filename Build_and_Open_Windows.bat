@echo off
setlocal enabledelayedexpansion

REM Detect package manager (prefer npm)
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Chua cai Node.js hoac npm. Vui long cai Node tai https://nodejs.org
  pause
  exit /b 1
)

echo [1/3] Cai dependencies...
npm install
if errorlevel 1 (
  echo [ERROR] npm install that bai.
  pause
  exit /b 1
)

echo [2/3] Build project...
npm run build
if errorlevel 1 (
  echo [ERROR] Build that bai.
  pause
  exit /b 1
)

REM Determine build folder (build or dist)
set BUILD_DIR=build
if not exist "%CD%\build\index.html" (
  if exist "%CD%\dist\index.html" (
    set BUILD_DIR=dist
  )
)

echo [3/3] Mo file %BUILD_DIR%\index.html ...
start "" "%CD%\%BUILD_DIR%\index.html"

echo Hoan tat!
pause
