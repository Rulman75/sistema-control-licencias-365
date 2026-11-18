@echo off
title Sistema de Control de Licencias Microsoft 365 - CMDS Antofagasta
echo ============================================================================
echo   CORPORACION MUNICIPAL DE DESARROLLO SOCIAL DE ANTOFAGASTA (CMDS)
echo   Iniciando Sistema de Control de Licencias Microsoft 365 (Puerto 3008)...
echo ============================================================================
cd /d "%~dp0backend"
start "" "http://localhost:3008"
node server.js
pause
