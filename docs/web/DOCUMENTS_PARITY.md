# Документы: паритет desktop 3.8.3 ↔ web

Эталон: **My_Stamina 3.8.3** `9622f3e` (`stamina/docs*.py`).  
Web: зона `docs` — `frontend/src/docs/*`, `backend/app/api_docs.py`, `backend/app/docs_io.py`.

Статусы: ✅ есть · ⚠️ частично · ❌ нет · 🌐 web-only (осознанно иначе в браузере)

## Сводка

| Область | Desktop | Web |
| --- | --- | --- |
| Зона в шапке перед Орионом | ✅ | ✅ |
| Список / создать / открыть / править | ✅ | ✅ |
| Автосохранение + конфликт | ✅ (файл `.stdoc`) | ✅ (rev + 409) |
| Версии 10 мин / 20 шт., restore | ✅ | ✅ |
| Печать | ✅ PDF viewer | 🌐 `window.print` + print CSS |
| Markdown-лента форматирования | ✅ | ✅ |
| Картинки / drag-resize | ✅ | ⚠️ вставка + width в HTML/`img`; без drag-угла |
| Корзина / удаление | ✅ | ✅ soft-delete + restore + purge |
| Экспорт txt/md/html/docx/pdf | ✅ | ✅ txt/md/html/docx/stdoc; PDF = Print→PDF |
| Импорт md/docx/txt | ✅ | ✅ + `.stdoc` (web-1) |
| Шаблоны нового документа | ✅ | ✅ |
| Найти/заменить, undo стек | ✅ | ✅ |
| Диктовка / перевод / проверка ИИ | ✅ | ❌ вне web-очереди (LLM on-demand) |
| Озвучка (read aloud) | ✅ | ✅ `/api/tts` + Web Speech |
| Изоляция по пилоту | файл на диске | ✅ cookie + SQL |

## Таблица возможностей

| # | Возможность | Desktop (источник) | Web | Заметка |
| --- | --- | --- | --- | --- |
| 1 | Зона `docs` в `ZONE_ORDER` | `nav.py` | `shell/zones.ts` | ✅ |
| 2 | Список документов (свежие сверху) | `docs.list_docs` | `GET /api/docs` | ✅ пагинация UI |
| 3 | Создать пустой | «+ НОВЫЙ» | `POST /api/docs` | ✅ |
| 4 | Открыть / сохранить | `.stdoc` zip | `GET/PUT /api/docs/{id}` | ✅ body = Markdown text |
| 5 | Autosave | да | debounce ~700 ms | ✅ |
| 6 | Optimistic concurrency | — | `rev` + HTTP 409 | 🌐 web сильнее для multi-tab |
| 7 | Версии ≤20 / ≥10 мин | `docs.snapshot` | `PilotDocVersion` | ✅ |
| 8 | Restore версии | да | `POST …/restore` | ✅ |
| 9 | Печать | Ctrl+P → PDF | кнопка → браузер | 🌐 |
| 10 | Счётчик слов | да | да | ✅ |
| 11 | Гость не пишет | — | 401 / UI | ✅ |
| 12 | Cookie isolation | N/A | да | ✅ |
| 13 | Поиск / фильтр списка | `filter_items` | `?q=` + поле поиска | ✅ |
| 14 | Сортировка списка | `sort_items` | `?sort=updated\|created\|title` | ✅ |
| 15 | Корзина / restore / purge | `remove_to_trash`… | `DELETE` / `restore-trash` / `purge` | ✅ |
| 16 | Шаблоны (встреча, дела…) | `docs_templates` | `GET /api/docs/templates` + ▾ | ✅ |
| 17 | Markdown toolbar (B/I/H1/…) | `docs_format` | лента + ⋯ | ✅ |
| 18 | Visual mode (прятать маркеры) | `docs_visual` | 🌐 вкладка «Наглядный» = preview HTML | ближайший веб-эквивалент без contenteditable |
| 19 | Find / replace | Ctrl+F/H | панель + Ctrl+F/H | ✅ |
| 20 | Undo/redo документный | `docs_undo` | `DocUndoStack` + Ctrl+Z/Y | ✅ |
| 21 | Картинки + resize | `docs_imgdrag` | ⚠️ файл → `<img width>` в body; без drag-угла | data-URL в body; лимит `BODY_MAX` |
| 22 | Paste rich / plain | Ctrl+V / Shift+V | HTML→MD; plain без `text/html` | ✅ |
| 23 | Экспорт txt/md/html/docx/pdf | `docs.export_*` | `/export?fmt=` | ✅; PDF = Print→PDF (кириллица) |
| 24 | Импорт md/docx/txt | `docs_import` | `POST /api/docs/import` | ✅ + `.stdoc` |
| 25 | Preview отдельным окном | `docs_preview` | 🌐 режим preview в панели (no-scroll) | ✅ лучше вкладок, чем popup |
| 26 | Диктовка / перевод / check | `docs_tools` | ❌ | вне MVP; ИИ on-demand не тащить |
| 27 | Read aloud / TTS | `ReadAloudMixin` | кнопка «Озвучить» | ✅ |
| 28 | Отправка / почта | temp `.send` | ❌ | не в web-очереди |
| 29 | Формат `.stdoc` (segments+images) | zip JSON+images | ⚠️ web-1: title+body (+segments t) | roundtrip текста; картинки desktop-сегментов → MD-ссылки |
| 30 | Без прокрутки страницы | окно Tk | pager + e2e list/edit/preview/trash | ✅ |
| 31 | Сохранить сейчас | Ctrl+S | Ctrl/Cmd+S + кнопка | ✅ |

## Сознательно иначе / остаток

| Тема | Решение |
| --- | --- |
| Visual mode как у Tk (прятать маркеры в той же textarea) | В браузере — preview-вкладка; contenteditable+mdlite не тащили |
| PDF на сервере (fpdf+TTF) | Не добавляем зависимость; Print→PDF в браузере = равный/лучший кириллический путь |
| Drag-resize картинок | Нет уголков в textarea; width в разметке / перевставка |
| Диктовка / LLM-check / перевод | Как в handoff: не on-demand LLM |
| Почта / `.send` | Вне web-очереди |
| Миграция дисковых `.stdoc` пилота с десктопа | Отдельное решение Сергея; импорт одного файла уже есть |

## Связанные файлы web

- `frontend/src/docs/DocsPanel.tsx`, `docsApi.ts`, `docsFormat.ts`, `docsMd.ts`, `docs.css`
- `backend/app/api_docs.py`, `backend/app/docs_io.py`
- e2e: `frontend/e2e/s2-docs.spec.ts`
