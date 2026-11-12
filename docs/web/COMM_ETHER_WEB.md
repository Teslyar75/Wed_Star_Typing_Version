# Эфир (web) — чат пилотов

Пилот↔пилот через `/api/comm`. **ИИ / Орион / OpenCode в Эфире не отвечают.**  
Индикатор «Эфир: на связи» — доступность API ленты, не LLM.

## Откуда функции

| Функция | Источник | В Эфире |
| --- | --- | --- |
| Лента, автор=позывной, цвет акцента, своё ▸ | desktop `comm_screen.py` | да |
| ОТПРАВИТЬ / ОБНОВИТЬ / Enter | desktop + Orion compose | да (`hud-btn`) |
| Лимиты 500/500, гость не пишет, автор из cookie | desktop `comm.py` + web | да |
| Pager без прокрутки страницы | web Orion/Docs pattern | да |
| Копировать / открыть полностью / превью картинки | Orion chat UI (`crewChatUi`) | да |
| TTS (web speak) / диктовка Web Speech | Orion chat UX (без ИИ) | да |
| Вложения-картинки (data URL, ≤3, ≤2MB) | Orion attach UX + `images_json` | да |
| Поиск по ленте | Docs list filter | да (клиент) |
| Markdown в теле | Docs `mdToHtml` | да |
| Экспорт txt/md/html | Docs export idea (клиент) | да |
| Статус связи с сервером Эфира | web | да (`comm-link`) |
| Задачи/архив/агенты/LLM Orion | — | **нет** |
| Редактор Документов / версии / почта | — | **нет** |

Миграция: колонка `comm_messages.images_json` через `_ensure_columns` (default `[]`) — старые текстовые сообщения сохраняются.
