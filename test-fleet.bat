@echo off
echo [1/2] Starting fleet server...
start /min "Fleet Server" cmd /c agent-fleet start --server-only

echo Waiting for server to be ready...
:wait_loop
timeout /t 1 /nobreak >nul
curl -s http://127.0.0.1:4600/health >nul 2>&1
if errorlevel 1 goto wait_loop
echo [2/2] Server ready! Launching CLIs...

wt -w fleet-demo new-tab -d "%cd%" --title Claude -- cmd /k claude ; split-pane -V -d "%cd%" --title Gemini -- cmd /k gemini ; split-pane -H -d "%cd%" --title Codex -- cmd /k codex
