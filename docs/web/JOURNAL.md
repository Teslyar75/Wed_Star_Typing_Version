# Журнал веб-работ (по дням)

Локальный дневник проделанной работы над веб-версией Star Typing.  
Код: папка `web_star_typing/` → [Wed_Star_Typing_Version](https://github.com/Teslyar75/Wed_Star_Typing_Version).  
Эталон десктопа: `stamina/` в этом монорепо (только чтение).

**Правило:** в конце каждого рабочего дня добавлять строку в таблицу ниже и файл `SESSION_YYYY-MM-DD.md` с деталями. Не заменять старые сессии — только дописывать.

---

## Хронология

| День | Тема | Журнал сессии |
| --- | --- | --- |
| **2026-11-08** | S0 e2e CI · S1 зоны · handoff S0–S7 · S2 Документы | [SESSION_2026-11-08.md](./SESSION_2026-11-08.md) · [CURSOR_HANDOFF.md](./CURSOR_HANDOFF.md) |
| **2026-10-15** | Настройки мостика · ЭКРАН/крошки · библиотека→печать · мигание буквы | [SESSION_2026-10-15.md](./SESSION_2026-10-15.md) |
| **2026-10-14** | Зоны IA · бортжурнал · сканер · настройки · атлас/карты | [SESSION_2026-10-14.md](./SESSION_2026-10-14.md) |
| **2026-10-13** | Библиотека (полка/Gutenberg) · Docker/диск · починка CSS-стекла | [SESSION_2026-10-13.md](./SESSION_2026-10-13.md) |

Новые дни — **сверху** таблицы (свежее выше).

---

## Связанные документы (не дневник)

| Файл | Зачем |
| --- | --- |
| [CURSOR_HANDOFF.md](./CURSOR_HANDOFF.md) | **вход Cursor / Сергей** |
| [WEB_PARITY_STAGES.md](./WEB_PARITY_STAGES.md) | очередь S0–S7 |
| [PROGRESS.md](./PROGRESS.md) | SHA / PR / CI |
| [BLOCKERS.md](./BLOCKERS.md) | блокеры |
| [STATUS.md](./STATUS.md) | что уже в коде (сводка, не по дням) |
| WEB_NEXT.md | **нет в этом репо** (копия в My_Stamina `docs/web/WEB_NEXT.md`, снимок 14.10 — устарел для S0) |
| [WEB_PLAN.md](./WEB_PLAN.md) | **исторический**: фазы 0–8 (очередь — WEB_PARITY_STAGES) |
| NAV_ZONES.md / ENGLISH_PARITY_GAPS.md | **нет в этом репо** — канон зон: `frontend/src/shell/zones.ts` |

---

## Шаблон новой сессии

Создать `docs/web/SESSION_YYYY-MM-DD.md`:

```markdown
# Сессия YYYY-MM-DD — краткий заголовок

## Цель сессии
…

## Сделано
| Область | Файлы | Суть |
| --- | --- | --- |
| … | … | … |

## Проверка
…

## Не сделано / хвосты
…
```

Затем добавить строку в таблицу «Хронология» выше и ссылку в [README.md](./README.md).
