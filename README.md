# Star Typing Web — пульт пилота в браузере 🚀

Слепая печать · английский · скорочтение · радио · отдых.  
Интерфейс в стиле космической кабины: стекло, живой космос, прицел набора.

![Живой космос за стеклянными панелями](docs/showcase/living_space.gif)

**Репозиторий:** [Teslyar75/Wed_Star_Typing_Version](https://github.com/Teslyar75/Wed_Star_Typing_Version)

Откройте в Chrome или Edge — без установки Python.

---

## Быстрый старт

### Что нужно для запуска

| | Требование |
|---|---|
| **Система** | Windows 10/11 (Docker Desktop + WSL2 и виртуализация в BIOS), Linux или macOS |
| **Docker** | Docker Desktop 4.x или Docker Engine 24+ — обязательно **с Compose v2**: команда `docker compose` (через пробел). Старая `docker-compose` (v1) не подходит |
| **Память** | от 4 ГБ свободной оперативной памяти: Postgres + API + сборка фронта |
| **Диск** | ~5 ГБ свободно на первую сборку (образы ~1.5 ГБ + `node_modules`); после — ~2 ГБ |
| **Порты** | **80** (и **443**, если нужен HTTPS) свободны. Занят — `start.sh` и `.bat` сами перейдут на **8080** (443 → 8443) |
| **Интернет** | первый запуск: скачивание образов и пакетов, ~1.5 ГБ, обычно 5–10 минут |
| **Браузер** | Chrome, Edge, Firefox или Safari последних версий (нужны PWA, Web Audio, Canvas) |
| **Модель речи** | необязательна: Vosk-модель в `../models` (или `MODELS_DIR`). Без неё всё работает, кроме распознавания произношения в «Английском» |
| **Не нужно** | Python, Node.js, npm, база данных — всё собирается и живёт внутри контейнеров |

Проверка после запуска: `curl http://localhost/api/health` → `{"ok":true}` (на 8080 — тот же адрес с портом).
Если что-то не так — таблица [«Если не запускается»](#если-не-запускается) ниже.

### Ярлык на рабочий стол (Windows + Docker)

1. **Docker Desktop** установлен и может быть уже запущен (зелёный статус).
2. Ярлык **Star Typing Web** на рабочем столе → двойной клик → контейнеры + браузер на http://localhost.  
   Создать ярлык заново: `install-desktop-shortcut.bat`
3. Скрипт: `start-star-typing-web.bat` (без полной пересборки при каждом старте). Пересборка: `start-star-typing-web.bat /rebuild`.

Нужно: Docker Desktop с Compose v2; свободные 80/443 (иначе 8080/8443). Старые
Docker без Compose v2 и занятые порты скрипт теперь распознаёт и объясняет, а не молчит.

### Обновления (GitHub Releases)

В приложении: баннер при новой версии и блок **Настройки → Ещё → Обновления** (changelog + ссылка на Release).  
Образ Docker **не** тянется сам — обновите через ярлык или:

```bat
start-star-typing-web.bat /rebuild
```

Релиз разработчику: bump `frontend/package.json` + `CHANGELOG.md`, затем `git tag v0.2.0 && git push origin v0.2.0` (Actions создаст Release).

### Linux и macOS

```bash
git clone https://github.com/Teslyar75/Wed_Star_Typing_Version.git
cd Wed_Star_Typing_Version
./start.sh                 # соберёт и откроет http://localhost
./start.sh --rebuild       # пересобрать после обновления
./start.sh --stop          # остановить
```

Скрипт сам проверяет Docker и Compose v2, а если **порт 80 занят** (nginx, другой
контейнер) — поднимает на **http://localhost:8080**. Порт можно задать заранее:
`WEB_PORT=8000 ./start.sh`.

Нужен Docker Engine 24+ с Compose v2 (Ubuntu / Debian: `sudo apt install docker.io docker-compose-v2`)
и право работать с Docker без sudo: `sudo usermod -aG docker $USER`, затем выйти и войти в систему.
Первый запуск — 5–10 минут: скачиваются образы и собирается фронт.

### Docker вручную

Нужен Compose v2: `docker compose version` должен отвечать (v1 `docker-compose` не подойдёт).

```bash
git clone https://github.com/Teslyar75/Wed_Star_Typing_Version.git
cd Wed_Star_Typing_Version
docker compose up --build
```

| | |
| --- | --- |
| UI | http://localhost |
| API | http://localhost/api/health → `{"ok":true}` |

Порт занят — `WEB_PORT=8080 docker compose up -d`, сайт будет на `http://localhost:8080`.
Модель распознавания речи ищется в `../models` (папка десктопного репозитория);
другое место — `MODELS_DIR=/путь/к/models docker compose up -d`. Без модели всё
работает, кроме распознавания произношения в «Английском».

Прод с HTTPS (Let's Encrypt):

```bash
export DOMAIN=star.example.com
export ACME_EMAIL=you@example.com
docker compose up --build -d
```

Для публичного адреса нужно: домен с A-записью на этот сервер, открытые входящие **80 и 443**
(80 обязателен — Caddy получает сертификат через него) и рабочий адрес почты в `ACME_EMAIL`.
Локально ничего этого не требуется: `DOMAIN` по умолчанию `:80`, без TLS.

### Если не запускается

| Что видно | Причина и что делать |
| --- | --- |
| `port is already allocated` / `address already in use` | порт 80 занят (IIS, nginx, XAMPP, другой контейнер). Запустите `./start.sh` — он сам уйдёт на 8080, или задайте `WEB_PORT=8080` |
| `'compose' is not a docker command` | стоит Compose v1. Нужен v2: обновите Docker Desktop, на Ubuntu — `sudo apt install docker-compose-v2` |
| `Docker did not become ready` | Docker не запущен или не поднялся: откройте Docker Desktop и дождитесь зелёного статуса (Windows: нужны WSL2 и виртуализация в BIOS) |
| Сборка идёт очень долго | первый запуск скачивает ~1.5 ГБ образов и собирает фронт: 5–10 минут — это нормально |
| Сайт открылся, но «Английский» без распознавания речи | нет модели Vosk: положите её в `../models` или укажите `MODELS_DIR` |
| Порт 8080 тоже занят | `WEB_PORT=8000 ./start.sh` (любой свободный) |

Старый ярлык на рабочем столе запускает Windows-скрипт `start-star-typing-web.bat`:
он тоже проверяет Compose и сам переезжает на 8080.

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

- **Гид ОРИОН** — бортовой разум: диалоги на старте и в зонах, звание / рекорд / перерыв / ошибки; вкладка «Гид» в Настройках.
- **Шутки Ориона** — иногда сам прерывает тишину или приглушает радио (~раз в 10 мин); **Enter** — слушать, **Esc** — не сейчас.
- **Вызов Ориона** — кнопка **ОРИОН**, **Home** или палитра: слушает RU («дай шутку» / «смени волну»); радио молчит до конца диалога.
- **СЛАЙДЫ** — кнопка рядом с **ЭКРАН**: ← → волна, ↑ ↓ громкость, M — mute; после выхода масштаб UI сохраняется.
- **Скин «Старая Англия»** — туман, слайдшоу, радио, своя лексика (Звездолёт по умолчанию).
- **Интерфейс на українській и Deutsch.**

| Гид | Старая Англия |
| --- | --- |
| ![Гид](docs/showcase/new/11_orion_dialog.jpg) | ![Старая Англия](docs/showcase/new/20_oe_fleet_street.jpg) |

Подробно: [docs/FEATURES_2026-10.md](docs/FEATURES_2026-10.md) · видение гида: [docs/ORION_VISION.md](docs/ORION_VISION.md) · онлайн-хостинг (Pages + API): [docs/HOSTING_GITHUB_PAGES.md](docs/HOSTING_GITHUB_PAGES.md) · стоимость (UA): [docs/HOSTING_COST_UA.md](docs/HOSTING_COST_UA.md) · скриншоты: [docs/showcase/new/](docs/showcase/new/)

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
| [docs/ORION_VISION.md](docs/ORION_VISION.md) | Орион: сделано, цель, подписка на ИИ-агента |
| [docs/FEATURES_2026-10.md](docs/FEATURES_2026-10.md) | Новое за октябрь 2026 |
| [docs/HOSTING_GITHUB_PAGES.md](docs/HOSTING_GITHUB_PAGES.md) | Онлайн: GitHub Pages + отдельный API |
| [docs/HOSTING_COST_UA.md](docs/HOSTING_COST_UA.md) | Стоимость хостинга для Украины (год) |
| [docs/CHANGELOG_2026-10-14.md](docs/CHANGELOG_2026-10-14.md) | Недавние изменения UI и навигации |
| [docs/showcase/](docs/showcase/) | Гифка и скрины |

Статус продукта (фазы 0–8, Excellence W0–P8): ✅ в проде.

## Промо-материалы

- 📘 [Брошюра (PDF, 27 стр.)](docs/promo/StarTyping_brochure.pdf)
- 📄 [Краткое промо (PDF, 8 стр.)](docs/promo/StarTyping_promo_short.pdf)

## Вдохновение

- **Слепая печать.** На создание тренажёра вдохновили программы вроде «Стамины» (Stamina) —
  название упомянуто здесь только с благодарностью, код и материалы у нас свои.
- **Английский по карточкам** — давно известная практика, но конкретно здесь вдохновил
  Богдан Стащук — подробнее в разделе [«Благодарности / Идея»](#благодарности--идея) ниже.
- **Скорочтение.** Интерфейс этой части фактически стал шаблоном для множества похожих программ;
  кого благодарить за саму идею, автор пока не знает — если подскажете, с радостью добавим.

## Благодарности / Идея

Идею модуля английского подсказал **Богдан Стащук (Bogdan Stashchuk)** — автор
[YouTube-канала](https://www.youtube.com/@Bogdan_Stashchuk) и
[курсов по программированию на Udemy](https://www.udemy.com/user/bogdanstashchuk/), а также
проекта [bsmarted.com](https://bsmarted.com/). Спасибо за вдохновение!

Реализация, дизайн, код и данные здесь — наши собственные: словарь собран из открытых
источников, никакие материалы bsmarted.com не используются. Программ такого рода много;
эта — личный вариант, встроенный в тренажёр печати Star Typing.

---

*Star Typing Web — браузерный пульт. Родственная настольная сборка: [My_Stamina](https://github.com/Teslyar75/My_Stamina).*
