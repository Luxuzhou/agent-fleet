@echo off
echo Test A: direct launch without cmd /k
wt -w fleet-test3 new-tab -d "%cd%" --title Claude -- claude -p "say hello" ; split-pane -V -d "%cd%" --title Gemini -- gemini -p "say hello"
pause
