@echo off
title NexPlay Arcade (Serverless Static Portal)
echo ===================================================
echo          NexPlay Arcade - Static Portal
echo ===================================================
echo.
echo Launching NexPlay Arcade on http://localhost:8080...
start http://localhost:8080
python -m http.server 8080
pause
