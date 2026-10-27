@echo off
title NexPlay Arcade - GitHub Sync
echo ===================================================
echo          NexPlay Arcade - 1-Click Git Push
echo ===================================================
echo.
python "%~dp0push_git.py" %*
echo.
pause
