# Star Typing Web — статус (Excellence / Parity)

Репозиторий: [Teslyar75/Wed_Star_Typing_Version](https://github.com/Teslyar75/Wed_Star_Typing_Version)  
Планы: [WEB_PLAN.md](./WEB_PLAN.md), [PARITY_PLAN.md](./PARITY_PLAN.md)

## Готово

| Эпик | Что в проде |
| --- | --- |
| W0 | Онбординг кабины, адаптив шапки, фокус мостика |
| P1 | Drill-миссии ★★★, ремонт клавиш, heatmap, карта на мостике |
| P2 | Библиотека: PDF/TXT, полка, позиция на сервере, Gutenberg search/import |
| P3 | English: отсеки due/inbox/favorite/learned, из книги, ранг/XP |
| P4 | Тахистоскоп, E-Pyr, журнал результатов с фильтром режима |
| P5 | Аватар, экспорт/импорт `.stpilot`, недавние позывные, logout |
| P6 | Загрузка сэмплов `/sounds/*` + synth fallback |
| P7 | Радио: приёмник prev/next, шкала избранного, duck при наборе, автозапуск last |
| P8 | Кают-компания: Snake MVP (Esc пауза / рестарт) |
| Фазы 0–8 | MVP: набор, читалка, english/vosk, speed, radio, PWA, Caddy |

## Опциональные хвосты

| Тема | Заметка |
| --- | --- |
| P2+ | Bilinguis-каталог |
| P4+ | Горбов, разгон WPM |
| P8+ | Tetris / Breakout |

## API (новые маршруты)

- `GET/POST /api/missions/drills*`, `/repair/start`, `/key-errors`
- `GET/PUT /api/library…`, `GET/POST /api/catalog/gutenberg…`
- `GET /api/english/warehouse?bin=`, `POST /move`, `/from-book`, `GET /progress`
- `GET /api/speedread/results?mode=`
- `POST /api/pilots/me/avatar`, `GET /api/pilots/me/export`

## Проверки

```powershell
cd backend; .\.venv\Scripts\python.exe -m pytest -q
cd ../frontend; npm test
```

После изменений — `git push origin master` в web-репо.
