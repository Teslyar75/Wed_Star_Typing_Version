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

**Docker (Postgres + API + Caddy :80)**

```powershell
docker compose up --build
# UI: http://localhost   API: http://localhost/api/health
```

Фронт собирается в static `dist`, Caddy отдаёт SPA и проксирует `/api/*`. HTTPS — раскомментируйте блок домена в `Caddyfile`.

## Статус фаз (WEB_PLAN)

| Фаза | Статус |
| --- | --- |
| 0 Каркас | ✅ |
| 1 Модель текста / сегменты | ✅ |
| 2 Тренажёр набора + `/api/sessions` | ✅ |
| 3 Пилоты / JWT cookie / доска почёта | ✅ |
| 4 2 языка / экран / перевод-кэш | ✅ |
| 5 Английский / SM-2 / TTS / vosk | ✅ |
| 6 RSVP + Шульте | ✅ |
| 7 living_space Canvas / скины / радио | ✅ |
| 8 i18n / PWA≥90 / Caddy / migrate | ✅ |

### Углубление

Сделано: фазы 0–8 + углубление (IndexedDB vosk, i18n UI, migrate UI, читалка sync, радиорубка+минибар, Web Audio, Caddy `DOMAIN` HTTPS).

```powershell
# прод с HTTPS (Let's Encrypt):
$env:DOMAIN="star.example.com"; $env:ACME_EMAIL="you@example.com"; docker compose up --build -d
```

```powershell
cd frontend
npm run fetch:vosk        # ~40MB модель ASR
npm run lighthouse:pwa    # LH 11, цель ≥90
```
