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
| Изоляция сессий / XP / миссии+claim | Pixi/living_space глубже |
| UPLINK + фоновый worker | Lighthouse audit на проде |
| vocab seed до 20k (из stamina) | |
| RSVP timing tests + API | |
| react-virtuoso читалка | |
| vosk-browser + `npm run fetch:vosk` | |
| Playwright e2e | |
| i18next + stamina locales | |
| PWA manifest 512 / SW v3 | |

```powershell
cd frontend
npm run fetch:vosk   # ~40MB модель ASR
```
