@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

set "PYTHONUTF8=1"
set "PYTHONDONTWRITEBYTECODE=1"
set "DATABASE_URL=sqlite:///./local-data/drone_platform.db"
set "LOCAL_STORAGE_DIR=local-storage"
set "DATASET_STORAGE_DIR=datasets"
set "REPORT_STORAGE_DIR=reports"
set "ASSET_STORAGE_DIR=assets"
set "DRONE_VIEW_DATASET_PREFIX=drone-route"
set "DRONE_VIEW_METADATA_FILE=metadata.csv"
set "DRONE_VIEW_DRONE_C_DATASET_PREFIX=songdo-route"
set "DRONE_VIEW_DRONE_C_METADATA_FILE=metadata_songdo.csv"
set "DRONE_VIEW_DRONE_C_IMAGE_DATASET_PREFIX=drone-route"

if exist ".env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env") do set "%%A=%%B"
) else (
  echo .env file not found. Using backend_local default SQLite/local-storage settings.
)

if not exist "local-storage\datasets\%DRONE_VIEW_DATASET_PREFIX%\%DRONE_VIEW_METADATA_FILE%" (
  if exist "local-storage\datasets\jamming-route\metadata.csv" (
    set "DRONE_VIEW_DATASET_PREFIX=jamming-route"
  )
)

if not exist "local-storage\datasets\%DRONE_VIEW_DRONE_C_DATASET_PREFIX%\%DRONE_VIEW_DRONE_C_METADATA_FILE%" (
  set "DRONE_VIEW_DRONE_C_DATASET_PREFIX="
  set "DRONE_VIEW_DRONE_C_IMAGE_DATASET_PREFIX="
)

set "PYTHON_EXE=python"
if exist ".venv\Scripts\python.exe" set "PYTHON_EXE=.venv\Scripts\python.exe"

"%PYTHON_EXE%" -m uvicorn main:app --host 127.0.0.1 --port 8000
