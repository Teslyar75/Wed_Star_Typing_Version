# Star Typing — веб-версия (документация)

**Код веб-версии:** отдельный репозиторий  
→ [Teslyar75/Wed_Star_Typing_Version](https://github.com/Teslyar75/Wed_Star_Typing_Version)

Локальная рабочая копия в монорепо: папка `web_star_typing/` (свой `.git`, в `My_Stamina` не коммитится).

| Файл | Назначение |
| --- | --- |
| [STATUS.md](./STATUS.md) | что уже в проде / инциденты |
| [SESSION_2026-10-13.md](./SESSION_2026-10-13.md) | журнал: библиотека, Docker, починка CSS стекла |
| [PARITY_PLAN.md](./PARITY_PLAN.md) | эпики P1–P8 |
| [WEB_PLAN.md](./WEB_PLAN.md) | стек, фазы 0–8, промпты Cursor, узкие места (2 языка, сегментация, UPLINK) |

## Скины (все версии)

Спека: [docs/skins/SKINS.md](../skins/SKINS.md).  
В веб-репо: `packages/themes/*.json` + `docs/skins/images/`.

## Контекст для агента

При работе над вебом опирайтесь на:

1. этот план и скины;
2. живой десктопный код в `stamina/` ([My_Stamina](https://github.com/Teslyar75/My_Stamina));
3. `ИНСТРУКЦИЯ.md`, `VIBE_CODING.md`, `docs/*` — поведение продукта и прошлые решения.
