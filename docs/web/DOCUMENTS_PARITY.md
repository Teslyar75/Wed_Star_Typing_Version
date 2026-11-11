# Документы: паритет desktop 3.8.3 ↔ web

Эталон: **My_Stamina 3.8.3** `9622f3e` (`stamina/docs*.py`).  
Web: зона `docs` (S2 / PR #19) — `frontend/src/docs/*`, `backend/app/api_docs.py`.

S2 сознательно = **MVP**, не полный клон. Ниже — сверка по возможностям.  
Крупные пробелы **не** закрывать в текущем PR (только учёт). Мелкие правки — только если тривиальны.

Статусы: ✅ есть · ⚠️ частично · ❌ нет · 🌐 web-only (осознанно иначе в браузере)

## Сводка

| Область | Desktop | Web |
| --- | --- | --- |
| Зона в шапке перед Орионом | ✅ | ✅ |
| Список / создать / открыть / править | ✅ | ✅ |
| Автосохранение + конфликт | ✅ (файл `.stdoc`) | ✅ (rev + 409) |
| Версии 10 мин / 20 шт., restore | ✅ | ✅ |
| Печать | ✅ PDF viewer | 🌐 `window.print` + print CSS |
| Markdown-лента форматирования | ✅ | ❌ plain textarea |
| Картинки / drag-resize | ✅ | ❌ |
| Корзина / удаление | ✅ | ❌ |
| Экспорт txt/md/html/docx/pdf | ✅ | ❌ |
| Импорт md/docx/txt | ✅ | ❌ |
| Шаблоны нового документа | ✅ | ❌ |
| Найти/заменить, undo стек | ✅ | ❌ (браузерный undo) |
| Диктовка / перевод / проверка ИИ | ✅ | ❌ |
| Озвучка (read aloud) | ✅ | ❌ |
| Изоляция по пилоту | файл на диске | ✅ cookie + SQL |

## Таблица возможностей

| # | Возможность | Desktop (источник) | Web | Заметка |
| --- | --- | --- | --- | --- |
| 1 | Зона `docs` в `ZONE_ORDER` | `nav.py` | `shell/zones.ts` | ✅ |
| 2 | Список документов (свежие сверху) | `docs.list_docs` | `GET /api/docs` | ✅ пагинация UI |
| 3 | Создать пустой | «+ НОВЫЙ» | `POST /api/docs` | ✅ |
| 4 | Открыть / сохранить | `.stdoc` zip | `GET/PUT /api/docs/{id}` | ✅ body = plain text |
| 5 | Autosave | да | debounce ~700 ms | ✅ |
| 6 | Optimistic concurrency | — | `rev` + HTTP 409 | 🌐 web сильнее для multi-tab |
| 7 | Версии ≤20 / ≥10 мин | `docs.snapshot` | `PilotDocVersion` | ✅ |
| 8 | Restore версии | да | `POST …/restore` | ✅ |
| 9 | Печать | Ctrl+P → PDF | кнопка → браузер | 🌐 |
| 10 | Счётчик слов | да | да | ✅ |
| 11 | Гость не пишет | — | 401 / UI | ✅ |
| 12 | Cookie isolation | N/A | да | ✅ |
| 13 | Поиск / фильтр списка | `filter_items` | ❌ | пробел |
| 14 | Сортировка списка | `sort_items` | только updated_at desc | ⚠️ |
| 15 | Корзина / restore / purge | `remove_to_trash`… | ❌ нет DELETE | пробел |
| 16 | Шаблоны (встреча, дела…) | `docs_templates` | ❌ | пробел |
| 17 | Markdown toolbar (B/I/H1/…) | `docs_format` | ❌ | пробел |
| 18 | Visual mode (прятать маркеры) | `docs_visual` | ❌ | пробел |
| 19 | Find / replace | Ctrl+F/H | ❌ | пробел |
| 20 | Undo/redo документный | `docs_undo` | браузерный | ⚠️ |
| 21 | Картинки + resize | `docs_imgdrag` | ❌ | пробел |
| 22 | Paste rich / plain | Ctrl+V / Shift+V | textarea plain | ⚠️ |
| 23 | Экспорт txt/md/html/docx/pdf | `docs.export_*` | ❌ | пробел |
| 24 | Импорт md/docx/txt | `docs_import` | ❌ | пробел |
| 25 | Preview отдельным окном | `docs_preview` | ❌ | пробел |
| 26 | Диктовка / перевод / check | `docs_tools` | ❌ | вне MVP; ИИ on-demand не тащить |
| 27 | Read aloud / TTS | `ReadAloudMixin` | ❌ | пробел |
| 28 | Отправка / почта | temp `.send` | ❌ | не в web-очереди |
| 29 | Формат `.stdoc` (segments+images) | zip JSON+images | SQL title+body | ⚠️ иная модель хранения |
| 30 | Без прокрутки страницы | окно Tk | pager + e2e S2 | ✅ |

## Что сознательно не тащим сейчас

- Полный rich-editor и картинки (модель данных web — plain `body`).
- Экспорт/импорт комбайном, почта, диктовка, LLM-проверка текста.
- Миграция `.stdoc` с диска десктопа (отдельное решение Сергея).

## Мелкие кандидаты (если когда-нибудь «тривиально»)

| Кандидат | Оценка |
| --- | --- |
| `DELETE` документа (сразу, без корзины) | маленький API+кнопка; лучше сразу с trash как desktop |
| Поиск по заголовку в списке | фильтр на клиенте по уже загруженным items |
| Пункт «Сохранить сейчас» (Ctrl+S → flush) | ~10 строк UI |
| Dropdown шаблонов при «Новый» | нужен i18n текстов шаблонов |

В этом PR крупные пробелы **не** реализуются.

## Связанные файлы web

- `frontend/src/docs/DocsPanel.tsx`, `docsApi.ts`, `docs.css`
- `backend/app/api_docs.py`
- e2e: `frontend/e2e/s2-docs.spec.ts`
