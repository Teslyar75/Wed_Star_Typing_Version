# Star Typing Web — пульт пилота в браузере 🚀

Браузерная версия [**Star Typing**](https://github.com/Teslyar75/My_Stamina): слепая печать · английский · скорочтение · радио · отдых.

![Живой космос: за стеклянными панелями летят звёзды, кометы, планеты и астероиды](docs/showcase/living_space.gif)

*Тот же «Живой космос», что на десктопе — Canvas/WebAudio в вебе, Pillow на [десктопе](https://github.com/Teslyar75/My_Stamina).*

**Репозиторий:** [Teslyar75/Wed_Star_Typing_Version](https://github.com/Teslyar75/Wed_Star_Typing_Version)  
**Десктоп (Tkinter):** [Teslyar75/My_Stamina](https://github.com/Teslyar75/My_Stamina)

---

## Зачем веб, если есть десктоп

| | **Десктоп** ([My_Stamina](https://github.com/Teslyar75/My_Stamina)) | **Веб** (этот репо) |
| --- | --- | --- |
| Запуск | Установка Python / `install.bat` | Браузер: Docker или `npm` + API |
| Где работает | Windows / Linux приложение | Chrome, Edge, PWA; любой ПК/ноут с сетью |
| Данные | Локально `%APPDATA%` / `~/.local` | Сервер (SQLite/Postgres) + пилот JWT |
| UI | Tkinter + Canvas | React + стекло CSS + живой космос |
| Навигация | Плоский ряд вкладок | **6 зон** + подменю Мостика + **крошки пути** |
| Установка | Pillow, vosk, mpv… | Один `docker compose up` |
| Офлайн | Полный | PWA-оболочка; ASR-модель кэшируется |

Веб **повторяет пульт** десктопа (мостик, миссии, английский, скорочтение, радио, lounge) и добавляет то, что удобнее в сети: вход с любого устройства, общий бэкенд, PWA, HTTPS через Caddy.

Скриншоты ниже — **эталоны интерфейса** из десктопного репозитория (тот же визуальный язык, что целится веб).

---

## Что умеет (паритет с десктопом)

| Отсек | Возможности |
| --- | --- |
| **Мостик** | Набор через прицел, скорость/точность, UPLINK-перевод, миссии ★★★, ремонт слабых клавиш |
| **Свой текст** | TXT / PDF / вставка → печать с позицией |
| **Бортжурнал** | Динамика, тепловая карта ошибок, слабые клавиши (мини-клавиши + цвет) |
| **Английский** | 20k слов, сканер, Vosk в браузере, SM-2, склад, «Из книги» |
| **Скорочтение** | Гипердрайв RSVP, Книга / 2 языка, Gutenberg + CEFR, Шульте / Горбов / пирамида / вспышка |
| **Радиорубка** | Эфир, приёмник, избранное, duck при наборе |
| **Отдых** | Змейка · Тетрис · Арканоид |
| **Экипаж** | Пилоты, PIN, доска почёта, аватар, `.stpilot` |
| **Прочее** | Живой космос, скины, ru/uk/en/de, F1-справка |

Статус Excellence **W0–P8** и фазы 0–8 — закрыты. Подробности: [docs/CHANGELOG_2026-10-14.md](docs/CHANGELOG_2026-10-14.md) · планы в монорепо [`docs/web/STATUS.md`](https://github.com/Teslyar75/My_Stamina/blob/master/docs/web/STATUS.md).

---

## Пульт: экраны (эталоны)

| Добро пожаловать | Мостик · первая миссия |
| --- | --- |
| ![Welcome](docs/showcase/01_welcome.png) | ![Bridge](docs/showcase/02_bridge.png) |

![Мостик: свой текст и UPLINK](docs/showcase/03_bridge_uplink.png)

| Английский | Скорочтение |
| --- | --- |
| ![English](docs/showcase/04_english.png) | ![Speedread](docs/showcase/05_speedread.png) |

| Радиорубка | Отдых |
| --- | --- |
| ![Radio](docs/showcase/06_radio.png) | ![Lounge](docs/showcase/07_lounge.png) |

![Бортжурнал](docs/showcase/08_flight_log.png)

---

## Чем веб отличается (намеренно)

1. **IA зон (2026-10-14).** Верхний ряд: Мостик · Английский · Скорочтение · Отдых · Радиорубка · Настройки. Миссии / Свой текст / Бортжурнал — **подменю Мостика**. Крошки пути (RU + slug). На десктопе пока плоский ряд — порт позже.
2. **Стекло и космос.** Панели через `--st-frame-fill` + blur; фон не «закрашивается» сплошным panel.
3. **Бортжурнал.** Цвет клавиш heatmap через glass; проценты — в списке слабых (мини-клавиши), не на каждой клавише клавиатуры.
4. **Настройки.** Библиотека и «2 языка» — только в зоне Скорочтение (без дубля в общих настройках). Скины и Экипаж в настройках остаются.
5. **Сервер.** Сегменты текста, перевод-кэш, прогресс пилота — FastAPI; один бэкенд на экипаж.

Хвосты паритета (плотность EN-карт, сканер на узкой высоте и т.п.) — в [`ENGLISH_PARITY_GAPS`](https://github.com/Teslyar75/My_Stamina/blob/master/docs/web/ENGLISH_PARITY_GAPS.md).

---

## Быстрый старт

### Docker (рекомендуется)

```powershell
git clone https://github.com/Teslyar75/Wed_Star_Typing_Version.git
cd Wed_Star_Typing_Version
docker compose up --build
```

- UI: http://localhost  
- API: http://localhost/api/health → `{"ok":true}`

HTTPS (Let's Encrypt):

```powershell
$env:DOMAIN="star.example.com"; $env:ACME_EMAIL="you@example.com"
docker compose up --build -d
```

### Локальная разработка

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
npm run fetch:vosk   # ~40 MB модель ASR (по желанию)
npm run dev
```

- UI: http://localhost:5173  
- Health: http://localhost:8000/api/health

```powershell
npm test
npm run lighthouse:pwa   # цель ≥ 90
```

---

## Структура

```
frontend/          # Vite + React + TypeScript
backend/           # FastAPI + SQLAlchemy + Alembic
packages/themes/   # JSON-скины
docs/              # changelog, showcase (скрины/гиф)
docker-compose.yml
Caddyfile
```

## Документация

| Документ | Содержание |
| --- | --- |
| [docs/CHANGELOG_2026-10-14.md](docs/CHANGELOG_2026-10-14.md) | Web vs desktop: IA, бортжурнал, сканер, настройки |
| [docs/showcase/](docs/showcase/) | Гифка и скрины (из десктопных эталонов) |
| [My_Stamina/docs/web](https://github.com/Teslyar75/My_Stamina/tree/master/docs/web) | STATUS, PARITY_PLAN, WEB_PLAN, NAV_ZONES |
| [My_Stamina README](https://github.com/Teslyar75/My_Stamina#readme) | Полная инструкция десктоп-версии |

---

## Статус

| Слой | Состояние |
| --- | --- |
| Фазы 0–8 (MVP) | ✅ |
| Excellence W0–P8 | ✅ миссии★★★, библиотека, EN bins, тренажёры, `.stpilot`, радио, lounge |
| IA зон + крошки | ✅ web first |
| Mic / ASR | работает (не ломать без нужды) |

*Бывший Stamina → Star Typing. Веб — отдельный репозиторий, десктоп не заменяет, а дополняет.*
