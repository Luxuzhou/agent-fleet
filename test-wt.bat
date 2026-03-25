@echo off
echo Testing Windows Terminal split-pane...
wt -w fleet-test new-tab -d "%cd%" --title Claude -- cmd /k echo Claude pane OK ; split-pane -V -d "%cd%" --title Gemini -- cmd /k echo Gemini pane OK ; move-focus left ; split-pane -H -d "%cd%" --title Codex -- cmd /k echo Codex pane OK ; move-focus first
echo Done. If you see 3 panes with "OK" messages, wt split works.
pause
