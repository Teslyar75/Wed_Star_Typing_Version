@echo off
setlocal EnableDelayedExpansion
title Star Typing Web
cd /d "%~dp0"

echo ========================================
echo   Star Typing Web - Docker
echo ========================================
echo.

set "DOCKER_EXE=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
set "URL=http://localhost"
set "SERVICES=postgres backend frontend caddy"
set "RETRIED=0"

docker info >nul 2>&1
if not errorlevel 1 goto docker_ok

echo [1/5] Docker not ready - starting Docker Desktop...
if not exist "%DOCKER_EXE%" goto no_docker
start "" "%DOCKER_EXE%"
echo       Waiting for Docker daemon...
set /a _n=0

:wait_docker
ping -n 6 127.0.0.1 >nul
docker info >nul 2>&1
if not errorlevel 1 goto docker_ok
set /a _n+=1
if !_n! GEQ 36 goto docker_fail
goto wait_docker

:no_docker
echo Docker Desktop not found:
echo   %DOCKER_EXE%
echo Install it, wait until status is green, then click the shortcut again.
pause
exit /b 1

:docker_fail
echo Docker did not become ready. Open Docker Desktop and retry.
pause
exit /b 1

:docker_ok
echo [1/5] Docker ready.

set "DO_BUILD=0"
if /I "%~1"=="/rebuild" set "DO_BUILD=1"
if /I "%~1"=="--rebuild" set "DO_BUILD=1"
docker image inspect web_star_typing-frontend >nul 2>&1
if errorlevel 1 set "DO_BUILD=1"
docker image inspect web_star_typing-backend >nul 2>&1
if errorlevel 1 set "DO_BUILD=1"

if "!DO_BUILD!"=="1" goto do_build
echo [2/5] Starting all 4 containers...
docker compose up -d --wait --wait-timeout 180 %SERVICES%
if errorlevel 1 goto compose_fail
goto after_compose

:do_build
echo [2/5] Building and starting all 4 containers...
docker compose up -d --build --wait --wait-timeout 300 %SERVICES%
if errorlevel 1 goto compose_fail

:after_compose
echo [3/5] Checking containers...
set "_cnt=0"
for /f %%C in ('docker compose ps --status running --services 2^>nul ^| find /c /v ""') do set "_cnt=%%C"
docker compose ps --format "table {{.Service}}\t{{.Status}}"
echo.
if not "!_cnt!"=="4" goto not_all_up
echo       Running: !_cnt!/4

echo [4/5] Waiting for site...
set /a _h=0

:wait_http
ping -n 2 127.0.0.1 >nul
curl.exe -fsS "%URL%/api/health" >nul 2>&1
if errorlevel 1 goto wait_http_next
curl.exe -fsS -o nul "%URL%/" >nul 2>&1
if not errorlevel 1 goto http_ok

:wait_http_next
set /a _h+=1
if !_h! GEQ 60 goto http_fail
goto wait_http

:http_fail
echo Site did not answer. Status:
docker compose ps -a
echo.
echo Logs tip: docker compose logs --tail=50
pause
exit /b 1

:http_ok
echo [4/5] Site OK
echo [5/5] Opening %URL%
start "" "%URL%"

echo.
echo Done. postgres + backend + frontend + caddy are up.
echo Stop:    docker compose down
echo Rebuild: %~nx0 /rebuild
echo.
ping -n 5 127.0.0.1 >nul
endlocal
exit /b 0

:not_all_up
echo.
echo Not all containers are running ^(!_cnt!/4^).
docker compose ps -a
if "!RETRIED!"=="1" goto still_incomplete
set "RETRIED=1"
echo.
echo Trying once more...
docker compose up -d --wait --wait-timeout 120 %SERVICES%
goto after_compose

:still_incomplete
echo Still incomplete. Logs:
docker compose logs --tail=40
pause
exit /b 1

:compose_fail
echo.
echo docker compose failed.
docker compose ps -a
echo.
echo Common causes:
echo   - port 80 or 443 busy
echo   - first build still needed: %~nx0 /rebuild
echo   - Docker Desktop not fully started
pause
exit /b 1
