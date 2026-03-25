@echo off
echo Test B: just claude alone in new tab
wt -w fleet-test4 new-tab -d "%cd%" --title Claude -- claude
pause
