# Star Typing — веб-версия (документация)

Репозиторий: [Wed_Star_Typing_Version](https://github.com/Teslyar75/Wed_Star_Typing_Version).  
Десктоп-эталон: [My_Stamina](https://github.com/Teslyar75/My_Stamina).

| Файл | Назначение |
| --- | --- |
| [WEB_PLAN.md](./WEB_PLAN.md) | стек, фазы 0–8, промпты для Cursor, **узкие места** (2 языка, сегментация, UPLINK) |

## Скины (все версии)

Единый формат — [docs/skins/SKINS.md](../skins/SKINS.md).  
JSON: `packages/themes/*.json`. Картинки: `docs/skins/images/<id>/` (+ [ATTRIBUTION.md](../skins/images/ATTRIBUTION.md)).

## Порядок работ (кратко)

1. **Фаза 0** — каркас (этот репозиторий) — сделано.
2. **Десктоп** (My_Stamina): промпты S1…S6 в SKINS.md.
3. **Фаза 1** — модель текста и API сегментов.
4. Дальше — промпты 3…9 по таблице фаз.
