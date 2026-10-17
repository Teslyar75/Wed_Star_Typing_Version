@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Ярлык Star Typing Web

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$bat = (Resolve-Path '.\start-star-typing-web.bat').Path;" ^
  "$lnk = Join-Path $env:USERPROFILE 'Desktop\Star Typing Web.lnk';" ^
  "$w = New-Object -ComObject WScript.Shell;" ^
  "$s = $w.CreateShortcut($lnk);" ^
  "$s.TargetPath = $bat;" ^
  "$s.WorkingDirectory = (Split-Path $bat);" ^
  "$s.WindowStyle = 1;" ^
  "$s.Description = 'Star Typing Web — Docker (http://localhost)';" ^
  "$s.Save();" ^
  "Write-Host ('Ярлык: ' + $lnk)"

if errorlevel 1 (
  echo Не удалось создать ярлык.
  pause
  exit /b 1
)

echo.
echo Готово. Двойной клик по «Star Typing Web» на рабочем столе
echo поднимет контейнеры (если Docker запущен) и откроет http://localhost
echo.
pause
endlocal
