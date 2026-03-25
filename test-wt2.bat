@echo off
echo Test 1: Launch claude in split panes
wt -w fleet-test2 new-tab -d "%cd%" --title Claude -- cmd /k claude -p "say hello" ; split-pane -V -d "%cd%" --title Gemini -- cmd /k gemini -p "say hello"
pause
