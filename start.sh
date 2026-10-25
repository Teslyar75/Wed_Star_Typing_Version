#!/usr/bin/env bash
# Star Typing Web — запуск в Docker на Linux и macOS.
#   ./start.sh              собрать (если нужно) и открыть сайт
#   ./start.sh --rebuild    пересобрать образы
#   ./start.sh --no-open    не открывать браузер (для сервера и CI)
#   ./start.sh --stop       остановить
#
# Если порт 80 занят (nginx, IIS-сосед по WSL, другой контейнер) — сам переедет на 8080.
# Порт можно задать заранее:  WEB_PORT=8000 ./start.sh
set -u
cd "$(cd "$(dirname "$0")" && pwd)" || exit 1

PORT="${WEB_PORT:-80}"
HTTPS_PORT="${WEB_HTTPS_PORT:-443}"
OPEN=1
REBUILD=0
LOG="${TMPDIR:-/tmp}/star-typing-web.log"

for a in "$@"; do
  case "$a" in
    --no-open) OPEN=0 ;;
    --rebuild) REBUILD=1 ;;
    --stop) docker compose down; exit $? ;;
  esac
done

say() { printf '\n\033[1;36m%s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[!] %s\033[0m\n' "$*"; }

say "STAR TYPING WEB — ЗАПУСК"

if ! command -v docker >/dev/null 2>&1; then
  warn "Docker не установлен. Ubuntu/Debian:  sudo apt install docker.io docker-compose-v2"
  warn "Docker Desktop: https://www.docker.com/products/docker-desktop/"
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  warn "Docker установлен, но не запущен. Запустите его и повторите."
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  warn "Нет Docker Compose v2 (команда «docker compose» через пробел)."
  warn "Поставьте плагин: на Ubuntu — пакет docker-compose-v2,"
  warn "или обновите Docker Desktop. Старая «docker-compose» не подходит."
  exit 1
fi

# --wait есть только в Compose 2.1+: без него дождёмся сайта сами
if docker compose up --help 2>&1 | grep -q -- "--wait"; then
  HAVE_WAIT=1
else
  HAVE_WAIT=0
fi

start() {
  say "Поднимаю контейнеры (порт $PORT)..."
  if [ "$REBUILD" = 1 ]; then
    if [ "$HAVE_WAIT" = 1 ]; then
      WEB_PORT="$PORT" WEB_HTTPS_PORT="$HTTPS_PORT" \
        docker compose up -d --build --wait --wait-timeout 300 >"$LOG" 2>&1
    else
      WEB_PORT="$PORT" WEB_HTTPS_PORT="$HTTPS_PORT" \
        docker compose up -d --build >"$LOG" 2>&1
    fi
  else
    if [ "$HAVE_WAIT" = 1 ]; then
      WEB_PORT="$PORT" WEB_HTTPS_PORT="$HTTPS_PORT" \
        docker compose up -d --wait --wait-timeout 300 >"$LOG" 2>&1
    else
      WEB_PORT="$PORT" WEB_HTTPS_PORT="$HTTPS_PORT" \
        docker compose up -d >"$LOG" 2>&1
    fi
  fi
}

if ! start; then
  if grep -qiE "port is already allocated|address already in use" "$LOG"; then
    warn "Порт $PORT занят — перехожу на 8080 (вместо 443 — 8443)."
    PORT=8080
    HTTPS_PORT=8443
    if ! start; then
      tail -30 "$LOG"
      warn "Не поднялось и на 8080. Подробности: $LOG"
      exit 1
    fi
  else
    tail -30 "$LOG"
    warn "docker compose завершился с ошибкой. Подробности: $LOG"
    exit 1
  fi
fi

if [ "$PORT" = "80" ]; then U="http://localhost"; else U="http://localhost:$PORT"; fi
say "Жду ответа сайта: $U"
for _ in $(seq 1 60); do
  if curl -fsS -m 3 "$U/api/health" >/dev/null 2>&1; then
    say "Готово: $U   (остановить: ./start.sh --stop)"
    if [ "$OPEN" = 1 ]; then
      (xdg-open "$U" >/dev/null 2>&1 || open "$U" >/dev/null 2>&1 || true) &
    fi
    exit 0
  fi
  sleep 2
done

warn "Сайт не ответил за 2 минуты. Состояние:"
docker compose ps -a
warn "Логи: docker compose logs --tail=50"
exit 1
