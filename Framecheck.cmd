@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if not errorlevel 1 (
  node -e "process.exit(typeof fetch === 'function' && typeof AbortSignal.timeout === 'function' ? 0 : 1)" >nul 2>nul
  if not errorlevel 1 goto use_node
)
where py.exe >nul 2>nul
if not errorlevel 1 (
  py -3 -c "import http.server" >nul 2>nul
  if not errorlevel 1 goto use_py
)
where python.exe >nul 2>nul
if not errorlevel 1 (
  python -c "import http.server" >nul 2>nul
  if not errorlevel 1 goto use_python
)
start "" "Framecheck.html"
exit /b

:use_node
node serve.mjs --open
goto finished

:use_py
py -3 portable.py --open
goto finished

:use_python
python portable.py --open

:finished
if errorlevel 1 pause
