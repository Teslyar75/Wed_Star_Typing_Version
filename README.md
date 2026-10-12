# Star Typing Web

Браузерная версия [Star Typing](https://github.com/Teslyar75/My_Stamina) (тренажёр слепой печати + английский + скорочтение).

**Репозиторий:** [Teslyar75/Wed_Star_Typing_Version](https://github.com/Teslyar75/Wed_Star_Typing_Version)

Десктоп (Tkinter) остаётся в [My_Stamina](https://github.com/Teslyar75/My_Stamina). Здесь — только веб.

## Документация

| Документ | Содержание |
| --- | --- |
| [docs/web/WEB_PLAN.md](docs/web/WEB_PLAN.md) | стек, фазы 0–8, промпты Cursor |
| [docs/skins/SKINS.md](docs/skins/SKINS.md) | скины (десктоп + веб) |

## Структура

```
frontend/          # Vite + React + TypeScript
backend/           # FastAPI + SQLAlchemy + Alembic
packages/themes/   # JSON-темы
docs/              # WEB_PLAN, SKINS
docker-compose.yml
Caddyfile          # HTTPS-заготовка
```

## Быстрый старт

**Бэкенд**

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pytest -q
uvicorn app.main:app --reload --port 8000
```

**Фронтенд**

```powershell
cd frontend
npm install
npm run dev
```

- UI: http://localhost:5173  
- Health: http://localhost:8000/api/health → `{"ok":true}`

**Docker**

```powershell
docker compose up --build
```

## Статус фаз (WEB_PLAN)

| Фаза | Статус |
| --- | --- |
| 0 Каркас | ✅ |
| 1 Модель текста / сегменты | ✅ |
| 2 Тренажёр набора + `/api/sessions` | ✅ |
| 3 Пилоты / JWT cookie / доска почёта | ✅ |
| 4 2 языка / экран / перевод-кэш | ✅ |
| 5 Английский / SM-2 / TTS (ASR stub) | ✅ |
| 6 RSVP + Шульте | ✅ |
| 7 Космос Canvas / скины / звук / радио | ✅ |
| 8 i18n / PWA / Caddy / migrate | ✅ |

### Углубление (после MVP)

| Сделано | Ещё впереди |
| --- | --- |
| Изоляция сессий пилота + XP | Playwright UI e2e |
| UPLINK Google/MyMemory + кэш | Очередь переводов в фоне (worker) |
| vocab seed 500 + склад due | Полный vocab 20k + миссии |
| RSVP/Шульте → `/api/speedread` | Тесты таймера <5 мс |
| Окно набора (не DOM 100k) | react-virtuoso для читалки |
| textutil TS + SpeechRecognition | vosk-browser WASM |
| API e2e регистрация→сессия→доска | Lighthouse PWA ≥90, полный i18next |
