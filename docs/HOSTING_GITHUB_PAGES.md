# Хостинг онлайн: GitHub Pages + отдельный API

Документ фиксирует задачу вынести Star Typing Web в интернет: UI на **GitHub Pages**, бэкенд — на отдельном хосте.  
Локальный Docker (ярлык / `docker compose`) остаётся основным способом полной установки дома.

**Репозиторий:** [Teslyar75/Wed_Star_Typing_Version](https://github.com/Teslyar75/Wed_Star_Typing_Version)  
**Связанные:** автообновления через Releases — [CHANGELOG.md](../CHANGELOG.md); видение Ориона — [ORION_VISION.md](ORION_VISION.md); **стоимость для Украины** — [HOSTING_COST_UA.md](HOSTING_COST_UA.md).

---

## 1. Цель

Дать пилоту открыть игру в браузере по адресу вида:

`https://teslyar75.github.io/Wed_Star_Typing_Version/`

без установки Docker на своём ПК, при этом сохранив:

- вход пилотов, миссии, английский, радио-прокси, TTS и прочий `/api/*`;
- возможность по-прежнему крутить полный стек локально через Docker.

---

## 2. Почему не «всё на GitHub Pages»

GitHub Pages отдаёт **только статику** (HTML/JS/CSS).

Сейчас продукт — четыре сервиса:

| Сервис | Роль |
| --- | --- |
| **frontend** | React/Vite → статика |
| **backend** | FastAPI (`/api/*`) |
| **postgres** | БД (в Docker; локально/на API возможен SQLite) |
| **caddy** | раздача UI + прокси `/api` на backend |

Pages заменяет только **frontend** (+ то, что сейчас раздаёт Caddy как файлы). Backend и БД на Pages разместить нельзя.

---

## 3. Целевая архитектура

```text
┌─────────────────────┐         ┌──────────────────────────┐
│  Браузер пилота     │         │  GitHub Pages            │
│                     │  HTML/  │  teslyar75.github.io/    │
│                     │◄────────│  Wed_Star_Typing_Version │
│                     │  JS/CSS │  (сборка frontend/dist)  │
│                     │         └──────────────────────────┘
│                     │
│                     │  fetch /api/*  (VITE_API_BASE)
│                     │         ┌──────────────────────────┐
│                     │────────►│  API-хост (Render / Fly) │
│                     │◄────────│  FastAPI + SQLite/PG     │
└─────────────────────┘  JSON   └──────────────────────────┘
```

| Слой | Где | URL (пример) |
| --- | --- | --- |
| UI | GitHub Pages | `https://teslyar75.github.io/Wed_Star_Typing_Version/` |
| API | Render (рекомендуется) или Fly.io / Railway | `https://star-typing-api.onrender.com` |
| БД | на API-хосте | SQLite файл или managed Postgres |

Локально без изменений по смыслу:

`browser → localhost (Caddy) → frontend_dist + backend:8000 + postgres`.

---

## 4. Решение по API-хосту

**Рекомендация: Render (Web Service).**

| Плюс | Минус |
| --- | --- |
| Бесплатный tier, деплой из GitHub | Free tier «засыпает» (~30 с на первый запрос) |
| У backend уже есть `DATABASE_URL` со **SQLite по умолчанию** | Нужен аккаунт и ручная привязка репо |
| Простой запуск `uvicorn` | Лимиты CPU/диска на free |

Альтернативы: **Fly.io**, **Railway** — та же схема (контейнер/процесс + env).

На старте достаточно SQLite; при росте нагрузки — Postgres на том же провайдере и `DATABASE_URL=postgresql+…`.

---

## 5. Объём работ (чеклист реализации)

### 5.1. Frontend (Pages)

- [ ] В Vite задать `base: '/Wed_Star_Typing_Version/'` для production-сборки под project Pages.
- [ ] Ввести `VITE_API_BASE` (например `https://….onrender.com`) — префикс для всех запросов к API.
- [ ] Единая точка переписывания URL (патч `fetch` / обёртка + `Audio` / прямые `location.href` на `/api/…`), чтобы не править сотни вызовов вручную.
- [ ] Service Worker: учитывать `base` и не кэшировать HTML/JS агрессивно (уже ослаблено в `sw.js` v60).
- [ ] Workflow `.github/workflows/pages.yml`: `npm ci && npm run build` → deploy `frontend/dist` на GitHub Pages (branch `gh-pages` или `actions/deploy-pages`).
- [ ] Secret / Variable в GitHub Actions: `VITE_API_BASE`.

### 5.2. Backend (API-хост)

- [ ] CORS: добавить origin Pages (`https://teslyar75.github.io`) в `CORSMiddleware` (сейчас только localhost).
- [ ] Cookie JWT: для кросс-домена нужны `SameSite=None; Secure` (сейчас `samesite="lax"` — с github.io на другой домен сессия не прилипнет).
- [ ] Env на хосте: `SECRET_KEY` (≥32), при необходимости `DATABASE_URL`, ключи Unsplash/Pexels по желанию.
- [ ] `render.yaml` или Dockerfile/команда старта: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
- [ ] Health: `GET /api/health` → `{"ok":true}` для мониторинга.

### 5.3. Документация и эксплуатация

- [ ] README: ссылка на Pages, как задать API, как обновить фронт (push в master) и API (redeploy на Render).
- [ ] Разделить сценарии: **дома Docker** vs **онлайн Pages+API**.
- [ ] Релизы (`v*`) по-прежнему через GitHub Releases; версия UI — `package.json` / `VITE_APP_VERSION`.

### 5.4. Вне скоупа этой задачи

- Авто-`docker compose pull` на машине пилота.
- Публикация образов в GHCR (можно позже).
- Перенос всего стека (Postgres+Caddy) на один «полный» VPS вместо связки Pages+API.
- Code signing / нативные установщики.

---

## 6. Поведение cookie и CORS (важно)

Авторизация — **JWT в httpOnly cookie** (`credentials: "include"` на фронте).

| Контекст | Cookie | CORS origin |
| --- | --- | --- |
| Docker / один origin (`localhost`) | `SameSite=Lax` достаточно | localhost |
| Pages UI + API на другом домене | `SameSite=None; Secure` обязательно | точный URL Pages |

Иначе пилот «войдёт», но следующие запросы к API будут без cookie → 401 / гость.

Опционально позже: JWT в `Authorization` header (проще для кросс-домена, но больше правок клиента).

---

## 7. Переменные окружения

### Frontend (build-time)

| Переменная | Пример | Назначение |
| --- | --- | --- |
| `VITE_API_BASE` | `https://star-typing-api.onrender.com` | База API без хвоста `/` |
| `VITE_APP_VERSION` | из `package.json` | баннер обновлений |

### Backend (runtime)

| Переменная | Пример | Назначение |
| --- | --- | --- |
| `SECRET_KEY` | случайная ≥32 | JWT |
| `DATABASE_URL` | `sqlite:///./data/star.db` или Postgres | БД |
| `CORS_ORIGINS` | `https://teslyar75.github.io` | список через запятую (после внедрения) |
| `COOKIE_SAMESITE` | `none` в проде Pages | флаг для `_set_cookie` |
| `UNSPLASH_ACCESS_KEY` / `PEXELS_API_KEY` | опционально | слайдшоу |

---

## 8. CI/CD

```text
push master (frontend/**)
        │
        ▼
  build Vite (base + VITE_API_BASE)
        │
        ▼
  GitHub Pages  ←── UI

push / manual deploy backend
        │
        ▼
  Render Web Service  ←── API
```

Теги `v*` по-прежнему создают **GitHub Release** с changelog (не путать с деплоем Pages).

---

## 9. Критерии готовности

1. Открытие `https://teslyar75.github.io/Wed_Star_Typing_Version/` показывает UI (не пустую 404 из‑за `base`).
2. `GET {VITE_API_BASE}/api/health` → `{"ok":true}`.
3. Регистрация / вход пилота с Pages сохраняет сессию (повторный F5 — тот же пилот).
4. Хотя бы один сценарий с API: миссия или список пилотов.
5. Локальный `docker compose up` / ярлык **не сломаны**.
6. В README есть обе ссылки: Pages и инструкция по API.

---

## 10. Риски и смягчение

| Риск | Смягчение |
| --- | --- |
| Free API «спит» | Текст «подождите 30 с» при первом заходе; позже — paid tier или Fly |
| Утечка `SECRET_KEY` | только secrets хоста / Actions, не в git |
| Сломанный `base` → белый экран | проверить пути ассетов и SW; Ctrl+Shift+R |
| Сотни хардкодов `/api` | один патч `fetch`/`Audio` на старте |
| Данные пилотов на чужом API | предупреждение в UI: онлайн-демо ≠ локальный Docker |

---

## 11. Порядок внедрения (предложение)

1. Backend: CORS + cookie SameSite из env; проверить health на Render с SQLite.
2. Frontend: `VITE_API_BASE` + патч запросов + `base` для Pages.
3. Actions: деплой Pages; secret `VITE_API_BASE`.
4. Ручной прогон: вход → мостик → одна миссия.
5. README + короткая пометка в CHANGELOG следующего релиза.

---

## 12. Статус

| Пункт | Статус |
| --- | --- |
| Документ задачи | **этот файл** |
| Код Pages / `VITE_API_BASE` / CORS cookie | **не начато** (ожидает реализации) |
| Аккаунт Render / URL API | **нужен у владельца репо** |
| Локальный Docker + Releases | **уже есть** |

---

## 13. Краткая формулировка задачи одной фразой

**Вынести UI Star Typing Web на GitHub Pages, а FastAPI — на отдельный хост (Render) с CORS и кросс-доменными cookie, не ломая локальный Docker.**
