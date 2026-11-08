# Продолжить после перезагрузки (2026-11-08)

Пилот выключил ПК: завис WSL (vmmemWSL pid 20160, wsl --shutdown не отвечает).
Данные Docker уже на D:, код закоммичен.

## Сразу после входа

1. Запустить Docker Desktop, дождаться зелёного кита.
2. Проверить: wsl -l -v отвечает за секунды (не таймаут).
3. Запустить веб: d:\My_New_Stamina\web_star_typing\start-star-typing-web.bat
4. Написать агенту в этот чат — поднять стек, если Docker уже зелёный.

## Где лежит Docker

- Дистрибутивы WSL: D:\DockerDesktopWSL\DockerDesktopWSL
- Образы: D:\DockerDesktopWSL\DockerDesktopWSL\disk\docker_data.vhdx (~26 ГБ)
- VM: ...\main\ext4.vhdx (~0.11 ГБ) — её и клинит
- Настройка: %APPDATA%\Docker\settings-store.json → CustomWslDistroDir
- C: ~18.5 ГБ свободно (после чистки Temp); D: ~33 ГБ

Не переносить Docker повторно. Не делать wsl --unregister docker-desktop-data — сотрёт образы.

## Git (уже на GitHub, не теряется)

Веб, ветка agent/grok/ci-i18n, HEAD cb30dce:
- PR #21 влит в master (0ae9afe) — Орион/журнал/дзен/OpenCode/автообновление
- PR #22 (CI i18n hotfix) запушен, в master ещё не влит
- Локально только мусор ?? _merge_tmp/ — не коммитить

Родитель agent/orion/comm-shots: грязные stamina/comm.py, comm_screen.py — чужая работа, не коммитить и не ресетить.

## Что осталось после ребута

1. Docker зелёный → start-star-typing-web.bat
2. Слить PR #22 в master, если CI приемлемый
3. Не трогать comm.py

Скрипт ремонта WSL (если снова повиснет, от админа): D:\DockerDesktopWSL\repair-wsl.ps1
