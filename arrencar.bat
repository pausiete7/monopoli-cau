@echo off
rem Obre el Caupoli des d'aquest ordinador, amb les fotos privades (caras, fons i preso).
rem Nomes es veu en aquest ordinador: el servidor no s'obre a la xarxa.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fotos.ps1"
start "Caupoli (no tanqueu aquesta finestra)" /min python -m http.server 8080 --bind 127.0.0.1
timeout /t 2 /nobreak >nul
start "" http://localhost:8080
