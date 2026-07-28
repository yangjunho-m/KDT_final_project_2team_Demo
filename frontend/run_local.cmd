@echo off
setlocal
chcp 65001 >nul

set "FRONTEND_DIR=%~dp0"
set "FRONTEND_DIR=%FRONTEND_DIR:~0,-1%"
set "VITE_DEV_PROXY_TARGET=http://127.0.0.1:8000"

if not exist "%FRONTEND_DIR%\package.json" (
  echo [ERROR] package.json not found: %FRONTEND_DIR%\package.json
  exit /b 1
)

pushd "%FRONTEND_DIR%" >nul
if errorlevel 1 (
  echo [ERROR] Cannot open frontend directory: %FRONTEND_DIR%
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or not available in PATH.
  echo Install Node.js LTS, reopen the terminal, then run this script again.
  popd
  exit /b 1
)

where npm.cmd >nul 2>nul
if not errorlevel 1 (
  if not exist "node_modules" call npm.cmd ci
  if errorlevel 1 (
    popd
    exit /b 1
  )
  call npm.cmd run dev -- --host 0.0.0.0 --port 5173
  set "EXIT_CODE=%errorlevel%"
  popd
  exit /b %EXIT_CODE%
)

echo npm is required to run the frontend.
popd
exit /b 1
