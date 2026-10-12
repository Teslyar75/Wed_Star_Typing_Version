# Общие темы (скины) Star Typing

**Один JSON — все версии программы:**

| Версия | Где подключается |
| --- | --- |
| **Web** (этот репозиторий) | `frontend/src/theme/applyTheme.ts`, позже Zustand + настройки пилота |
| **Desktop Tkinter** | `stamina/themes/<id>.json` в [My_Stamina](https://github.com/Teslyar75/My_Stamina) (промпт S1 в [SKINS.md](../../docs/skins/SKINS.md)) |
| **Картинки** | [docs/skins/images/](../../docs/skins/images/); в релизе — `themes/<id>/bg.jpg`, `icon.png` |

Формат полей — в [SKINS.md §1](../../docs/skins/SKINS.md). Список скинов:

- `spaceship` — текущий «пульт» (дефолт)
- `bathyscaphe`, `steampunk`, `scriptorium`, `neon_city`, `zen_garden`

При добавлении скина: JSON здесь + палитра в SKINS.md + ассеты в `docs/skins/images/<id>/`. Синхронизируйте с десктопом при необходимости.
