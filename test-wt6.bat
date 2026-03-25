@echo off
echo Launching claude + gemini + codex...
wt -w fleet-test6 new-tab -d "%cd%" --title Claude -- cmd /k claude ; split-pane -V -d "%cd%" --title Gemini -- cmd /k gemini ; move-focus left ; split-pane -H -d "%cd%" --title Codex -- cmd /k codex
pause
