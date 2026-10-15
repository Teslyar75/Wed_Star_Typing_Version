# Star Typing Web — пульт пилота в браузере 🚀

Слепая печать · английский · скорочтение · радио · отдых.  
Интерфейс в стиле космической кабины: стекло, живой космос, прицел набора.

![Живой космос за стеклянными панелями](docs/showcase/living_space.gif)

**Репозиторий:** [Teslyar75/Wed_Star_Typing_Version](https://github.com/Teslyar75/Wed_Star_Typing_Version)

Откройте в Chrome или Edge — без установки Python и ярлыков на рабочий стол.

---

## Быстрый старт

### Docker (рекомендуется)

```bash
git clone https://github.com/Teslyar75/Wed_Star_Typing_Version.git
cd Wed_Star_Typing_Version
docker compose up --build
```

| | |
| --- | --- |
| UI | http://localhost |
| API | http://localhost/api/health → `{"ok":true}` |

Прод с HTTPS (Let's Encrypt):

```bash
export DOMAIN=star.example.com
export ACME_EMAIL=you@example.com
docker compose up --build -d
```

### Разработка без Docker

**API**

```bash
cd backend
python -m venv .venv
# Windows: .\.venv\Scripts\Activate.ps1
# Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
pytest -q
uvicorn app.main:app --reload --port 8000
```

**UI**

```bash
cd frontend
npm install
npm run fetch:vosk    # опционально, ~40 MB модель распознавания речи
npm run dev
```

| | |
| --- | --- |
| UI | http://localhost:5173 |
| API | http://localhost:8000/api/health |

```bash
cd frontend && npm test
cd frontend && npm run lighthouse:pwa   # цель ≥ 90
```

---

## Что умеет

| Зона | Возможности |
| --- | --- |
| **Мостик** | Набор через прицел, скорость и точность, UPLINK-перевод, миссии ★★★, ремонт слабых клавиш |
| **Свой текст** | TXT / PDF / вставка → печать с сохранением позиции |
| **Бортжурнал** | График заходов, тепловая карта ошибок, слабые клавиши с цветом |
| **Английский** | ~20 000 слов, сканер, Vosk в браузере, SM-2, склад, «Из книги» |
| **Скорочтение** | Гипердрайв (RSVP), Книга / 2 языка, Gutenberg + CEFR, Шульте, Горбов, пирамида, вспышка |
| **Радиорубка** | Эфир, приёмник, избранное, приглушение при наборе |
| **Отдых** | Змейка · Тетрис · Арканоид |
| **Настройки** | Системы кабины, скины, экипаж (пилоты, PIN, доска почёта, `.stpilot`) |

**Навигация:** шесть зон в шапке (Ctrl+1…6). Миссии, свой текст и бортжурнал — подменю Мостика. Крошки пути с копируемым slug.

**Стек:** React + TypeScript (Vite) · FastAPI · Postgres/SQLite · Caddy · PWA · Web Audio / Canvas космос · vosk-browser.

---

## Новое (октябрь 2026)

### Гид ОРИОН — бортовой ИИ, который рассказывает историю
- На стартовом окне можно **выбрать гида** (или отказаться от него).
- ОРИОН — вежливый бортовой дворецкий с сухой британской иронией, обращается к пилоту «сэр». Голос — `ru-RU-DmitryNeural`.
- История подаётся **короткими диалогами**: первое знакомство, приветствия при входе в каждую зону, реплики на события — **новое звание, личный рекорд, возвращение после перерыва, серия ошибок**.
- В Настройках новая вкладка **«Гид»**: выбрать или выключить гида, повторить знакомство. Состояние хранится отдельно для каждого пилота.
- Гиды пока только на русском; другие языки — позже.

| Выбор гида | Первый диалог |
| --- | --- |
| ![Выбор гида](docs/showcase/new/10_guide_picker.jpg) | ![ОРИОН](docs/showcase/new/11_orion_dialog.jpg) |
| **Вкладка «Гид»** | **Реплика на новое звание** |
| ![Настройки гида](docs/showcase/new/12_settings_guide.jpg) | ![Новое звание](docs/showcase/new/13_orion_rank_up.jpg) |

### Скин «Старая Англия»
Пилот прочитал книгу и окружил себя её миром. Звездолёт остаётся основным скином по умолчанию.
- Лондонский **туман** на фоне, **слайдшоу** викторианских видов в простое, своё **радио** (Wireless).
- Вся космическая лексика заменена: Fleet Street вместо Мостика, Поручения, Дневник, Читальный зал, Чаепитие и т. д.; звания в разделе «Английский» тоже в стиле скина.
- Помещается на маленьких экранах (1280×640) без прокрутки.

| Fleet Street | Слайдшоу |
| --- | --- |
| ![Fleet Street](docs/showcase/new/20_oe_fleet_street.jpg) | ![Слайдшоу](docs/showcase/new/21_oe_slideshow.jpg) |
| **Радио (Wireless)** | **Английский в скине** |
| ![Wireless](docs/showcase/new/22_oe_wireless.jpg) | ![English](docs/showcase/new/23_oe_english.jpg) |

### Интерфейс на украинском и немецком
Переведено 452 строки на `uk` и `de`, тест `localeKeys` строго проверяет, что ни один ключ не пропущен. Добавлены недостающие строки скорости, единиц и очереди.

| Українська | Deutsch |
| --- | --- |
| ![uk](docs/showcase/new/30_uk.jpg) | ![de](docs/showcase/new/31_de.jpg) |

---

## Экраны

| Добро пожаловать | Мостик |
| --- | --- |
| ![Welcome](docs/showcase/01_welcome.png) | ![Bridge](docs/showcase/02_bridge.png) |

![Набор и UPLINK](docs/showcase/03_bridge_uplink.png)

| Английский | Скорочтение |
| --- | --- |
| ![English](docs/showcase/04_english.png) | ![Speedread](docs/showcase/05_speedread.png) |

| Радиорубка | Отдых |
| --- | --- |
| ![Radio](docs/showcase/06_radio.png) | ![Lounge](docs/showcase/07_lounge.png) |

![Бортжурнал](docs/showcase/08_flight_log.png)

---

## Зачем веб

- Запуск с любого компьютера в браузере (и как PWA).
- Один сервер на экипаж: прогресс пилотов, тексты, перевод-кэш.
- Docker Compose поднимает UI + API + БД + Caddy за одну команду.
- HTTPS из коробки через Caddy и Let's Encrypt.
- Распознавание речи локально в браузере (модель кэшируется).

---

## Структура репозитория

```
frontend/          # Vite + React + TypeScript
backend/           # FastAPI + SQLAlchemy + Alembic
packages/themes/   # JSON-скины
docs/              # changelog, showcase
docker-compose.yml
Caddyfile
```

## Документация

| Документ | Содержание |
| --- | --- |
| [docs/CHANGELOG_2026-10-14.md](docs/CHANGELOG_2026-10-14.md) | Недавние изменения UI и навигации |
| [docs/showcase/](docs/showcase/) | Гифка и скрины |

Статус продукта (фазы 0–8, Excellence W0–P8): ✅ в проде.

---

*Star Typing Web — браузерный пульт. Родственная настольная сборка: [My_Stamina](https://github.com/Teslyar75/My_Stamina).*
