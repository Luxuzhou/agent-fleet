@echo off
REM Test A: cmd /k + bare cli (no prompt)
echo Launching claude and gemini without prompt...
wt -w fleet-test5 new-tab -d "%cd%" --title Claude -- cmd /k claude ; split-pane -V -d "%cd%" --title Gemini -- cmd /k gemini
pause
