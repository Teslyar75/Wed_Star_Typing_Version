@echo off
chcp 65001 >nul
setlocal
title Star Typing Web
cd /d "%~dp0"

echo ========================================
echo   Star Typing Web — запуск
echo ========================================
echo.

REM Docker Desktop (данные на D:\DockerDesktopWSL)
set "DOCKER_EXE=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
docker info >nul 2>&1
if errorlevel 1 (
  echo [1/3] Запускаю Docker Desktop...
  if exist "%DOCKER_EXE%" (
    start "" "%DOCKER_EXE%"
  ) else (
    echo Не найден Docker Desktop: "%DOCKER_EXE%"
    echo Установите Docker Desktop и повторите.
    pause
    exit /b 1
  )
  echo       Жду готовности демона (до ~2 мин)...
  set /a _n=0
  :wait_docker
  timeout /t 5 /nobreak >nul
  docker info >nul 2>&1
  if not errorlevel 1 goto docker_ok
  set /a _n+=1
  if %_n% GEQ 36 (
    echo Docker не ответил. Откройте Docker Desktop вручную и запустите ярлык снова.
    pause
    exit /b 1
  )
  goto wait_docker
)
:docker_ok
echo [1/3] Docker готов.

echo [2/3] Поднимаю контейнеры (postgres, backend, frontend, caddy)...
docker compose up -d --build
if errorlevel 1 (
  echo Ошибка docker compose.
  pause
  exit /b 1
)

echo [3/3] Открываю http://localhost
timeout /t 2 /nobreak >nul
start "" "http://localhost"

echo.
echo Готово. Окно можно закрыть — сервисы работают в Docker.
echo Остановка:  docker compose -f "%~dp0docker-compose.yml" down
echo.
pause
endlocal
