@echo off
echo Launching: left=Claude, top-right=Gemini, bottom-right=Codex
wt -w fleet-test7 new-tab -d "%cd%" --title Claude -- cmd /k claude ; split-pane -V -d "%cd%" --title Gemini -- cmd /k gemini ; split-pane -H -d "%cd%" --title Codex -- cmd /k codex
pause
