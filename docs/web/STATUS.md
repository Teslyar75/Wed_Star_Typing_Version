# Star Typing Web — статус (Excellence / Parity / Surpass)

**Актуальная очередь агента (S0–S7):** [CURSOR_HANDOFF.md](./CURSOR_HANDOFF.md), [WEB_PARITY_STAGES.md](./WEB_PARITY_STAGES.md), [PROGRESS.md](./PROGRESS.md).  
«S1» Горбов и «S7 skins» в таблице ниже — **другие** исторические эпики, не этапы очереди 08.11.

Репозиторий: [Teslyar75/Wed_Star_Typing_Version](https://github.com/Teslyar75/Wed_Star_Typing_Version)  
Исторические планы: [WEB_PLAN.md](./WEB_PLAN.md), [PARITY_PLAN.md](./PARITY_PLAN.md).

## Готово

| Эпик | Что в проде |
| --- | --- |
| W0 | Онбординг кабины, адаптив шапки, фокус мостика |
| P1 | Drill-миссии ★★★, ремонт клавиш, heatmap, карта в `MissionsPanel` (не на BridgeScreen) |
| P2 | Библиотека: полка+паспорт, PDF/TXT/вставка, rename/delete, Gutenberg+CEFR, bilinguis EN↔RU/UK · хвосты — [SESSION_2026-10-13](./SESSION_2026-10-13.md) |
| P3 | English: отсеки due/inbox/favorite/learned, из книги, ранг/XP |
| P4 | Тахистоскоп, E-Pyr, журнал результатов с фильтром режима |
| P5 | Аватар, экспорт/импорт `.stpilot`, недавние позывные, logout |
| P6 | Загрузка сэмплов `/sounds/*` + synth fallback |
| P7 | Радио: приёмник prev/next, шкала избранного, duck при наборе, автозапуск last |
| P8 | Кают-компания: Snake MVP (Esc пауза / рестарт) |
| Фазы 0–8 | MVP: набор, читалка, english/vosk, speed, radio, PWA, Caddy |
| **E1** | English-хаб (подстраницы) + `GET /api/english/log` + streak + from-book с полки |
| **L1** | Bilinguis list/import + полка с % / продолжить / english / speed |
| **S1** | Горбов + WPM ramp + текст с полки + график журнала |
| **A1** | Реальные wav в `public/sounds` + микшер FX + SW prefetch |
| **R1** | Shortwave-фильтры + server favs + IndexedDB cache + Space/←→/+/- |
| **P1p** | `GET /api/pilots/dossier` + guest + drag-drop `.stpilot` |
| **G1** | Tetris + Breakout + `lounge_scores` + touch |
| **H1** | Help drawer, welcome-тур, Ctrl+K, space profiles frost/light/full |
| **S7 skins** | Per-skin FX + hard-reset при смене; эталон Звездолёт; image-сцены отложены |
| **W-fast** | Lazy-вкладки, auto frost на слабых CPU, ContinueHub + 7d-сводка на мостике |

## Инциденты / фиксации

| Дата | Что |
| --- | --- |
| 2026-11-08 | CI e2e на `a6142bf` красный: 3 fail + 1 flaky. Диагноз: overlay перехват клика «Экипаж»; гид G1 ловит Enter; вкладка English — `button` не `tab`; «Из книги» strict-mode (nav + обзор); карта миссий в `MissionsPanel`; sqlite 2 worker + honor top-10. S0: [SESSION_2026-11-08](./SESSION_2026-11-08.md). |
| 2026-11-08 | S1 (зоны/EN/lifecycle, не эпик Горбова): хоткеи 1–7 по `ZONE_ORDER`; abort/epoch/observeBox; скрытый EN уже размонтировался — покрыто тестами. Docs/Comm не добавлялись. |
| 2026-10-13 | Битый `index.css` (`truncated oversized` + вложенные `*/`) ломал стекло → белые окна; почищено; SW `st-shell-v38`. Docker: данные на D:, логи на C: — Disk full валил демон. Журнал: [SESSION_2026-10-13](./SESSION_2026-10-13.md) |

## На будущее

| Тема | Заметка |
| --- | --- |
| **P2+ library** | Gutenberg 2ЯЗ-пары DE/FR, «＋ ВРУЧНУЮ», attach/offer, scroll-каталог как desktop |
| **S8 Deep skins** | Не только цвета: формы кнопок/панелей, свой нарратив и роли на скин (дзен → наставник/послушник). Спека: монорепо `docs/skins/SKINS_DEEP.md` |

## API (Surpass)

- `GET /api/english/log`, streak в `/progress`
- `GET /api/catalog/bilinguis/list`, `POST /api/catalog/bilinguis/import`
- `GET/PUT /api/radio/favs`
- `GET /api/pilots/dossier`, `POST /api/pilots/guest`
- `GET/POST /api/lounge/scores`

## Проверки

```powershell
cd backend; .\.venv\Scripts\python.exe -m pytest -q
cd ../frontend; npm test
```

После изменений — `git push origin master` в web-репо.
