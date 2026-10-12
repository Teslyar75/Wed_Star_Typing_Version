# Star Typing Web

Браузерная версия [Star Typing](https://github.com/Teslyar75/My_Stamina) (тренажёр слепой печати + английский + скорочтение).

**Репозиторий:** [Teslyar75/Wed_Star_Typing_Version](https://github.com/Teslyar75/Wed_Star_Typing_Version)

Десктоп (Tkinter) остаётся в [My_Stamina](https://github.com/Teslyar75/My_Stamina). Здесь — только веб. Для контекста и переноса логики смотрите десктопный репо и документы в `docs/`.

## Документация

| Документ | Содержание |
| --- | --- |
| [docs/web/WEB_PLAN.md](docs/web/WEB_PLAN.md) | стек, фазы 0–8, промпты Cursor, узкие места (2 языка, сегментация, UPLINK) |
| [docs/web/README.md](docs/web/README.md) | оглавление веб-плана |
| [docs/skins/SKINS.md](docs/skins/SKINS.md) | скины для **всех** версий (десктоп + веб) |
| [docs/skins/images/](docs/skins/images/) | ассеты скинов + [ATTRIBUTION.md](docs/skins/images/ATTRIBUTION.md) |

## Структура

```
frontend/          # Vite + React + TypeScript
backend/           # FastAPI (+ позже SQLAlchemy / Alembic)
packages/themes/   # JSON-темы (общий формат с десктопом)
docs/              # WEB_PLAN, SKINS, картинки
docker-compose.yml
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

## Связь с десктопом

На фазе 0 бэкенд опционально импортирует пакет `stamina` из соседнего клона My_Stamina (`STAMINA_REPO_ROOT`). Без него `/api/meta` отдаёт `desktop_version: unknown` — это нормально.

Дальше логику переносим порциями (см. WEB_PLAN) или через общий пакет `star_typing_core`. Скины — JSON в `packages/themes/` + картинки в `docs/skins/images/`.

## Текущий статус

- **Фаза 0** — каркас (Vite/React, FastAPI health, темы, Docker Compose).
- **Фаза 1** — модель текста: `POST /api/texts`, `POST /api/texts/bilingual`, `GET /api/texts/{id}/segments`; сегментация + Gale–Church; Alembic `001`.

Дальше — фаза 2 (тренажёр набора) по WEB_PLAN.
