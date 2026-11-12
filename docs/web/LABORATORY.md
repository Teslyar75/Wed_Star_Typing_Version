# Лаборатория (web)

Порт отсека **Лаборатория** с desktop [My_Stamina PR #36](https://github.com/Teslyar75/My_Stamina/pull/36) (`docs/plans/laboratory.md`).

## Смысл

Граф знаний пилота (Obsidian-like): звёзды из выученных слов, книг, печати; рёбра — реальные связи. В центре — **сущность** (vitality/growth). Данные пилота **только читаются**.

## Три уровня

| Уровень | API | UI |
| --- | --- | --- |
| **VISUAL** (по умолчанию) | `GET /api/lab/visual` | кластеры, живая сущность, idle-yaw; без отдельных слов |
| **WORKING** | `GET /api/lab/fragment?group=` + `GET /api/lab/neighborhood?id=&offset=` | клик → фрагмент; выбор звезды → она + 1-hop порциями по 20 («Показать ещё»), кэш, отмена устаревшего |
| **FULL** | `POST /api/lab/snapshot` → `GET /api/lab/snapshot/{token}` (+ `DELETE` отмена) | «Полный слепок» чанками → JSON для сущности/агента |

`?demo=1` или `localStorage.st_lab_demo=1` — демо-граф (как desktop `STAMINA_LAB_DEMO`).

## Камера

- **Ctrl+wheel** — зум к точке под курсором (инвариант пикселя).
- Wheel без Ctrl — не зум карты.
- ЛКМ-drag — орбита yaw/pitch (pitch clamp); короткий клик ≠ drag.
- **1∶1** / **Ctrl+Home** — сброс вида (**не** Ctrl+0 — зона lab).

Рендер: Canvas 2D, throttle ~33 ms, без полного графа по умолчанию.

## Навигация / справка

- Зона `lab` в шапке (после Ориона, перед Настройками).
- **Ctrl+0** → lab; **Ctrl+9** → settings (FIXED_HOTKEYS).
- **F1** — вкладки «Уровни» / «Управление» (Tab / Shift+Tab).

## Источники данных (web)

| Desktop | Web |
| --- | --- |
| `english.json` words/cards/quality/verbs | `card_progress` + `vocab_words` + CEFR/verbs packs |
| `stats.json` runs/missions | `typing_sessions` + `drill_progress` |
| `speedread.json` | `speed_results` (+ упражнения по `mode`) |
| `library/library.json` | `pilot_texts` + `texts` |
| `book_sentences` | на web пока нет → рёбра слово↔книга из демо/тестового payload |

## Файлы

- Backend: `app/lab_data.py`, `lab_layout.py`, `lab_demo.py`, `api_lab.py`
- Frontend: `src/lab/*`
- Тесты: `backend/tests/test_laboratory.py`, `frontend/src/lab/labMath.test.ts`, `e2e/lab.spec.ts`
