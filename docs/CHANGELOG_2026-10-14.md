# Web vs Desktop — изменения 2026-10-14

Репозиторий: [Wed_Star_Typing_Version](https://github.com/Teslyar75/Wed_Star_Typing_Version)  
Эталон десктопа: [My_Stamina](https://github.com/Teslyar75/My_Stamina) (`stamina/`, только чтение).

Документ фиксирует **нововведения и отличия веб-версии** после сессии IA / бортжурнал / сканер / настройки.

---

## 1. Навигация (только веб)

На десктопе верхний ряд — плоский список вкладок (Мостик, Миссии, Свой текст, Бортжурнал, …).

**В вебе (IA 2026-10-14):**

| Было (ближе к старым вкладкам) | Стало |
| --- | --- |
| 9+ пунктов в шапке | **6 зон:** Мостик · Английский · Скорочтение · Отдых · Радиорубка · Настройки |
| Миссии / Свой текст / Бортжурнал в верхнем ряду | **подменю Мостика** |
| Нет крошек | **PathCrumbs:** RU-подпись + копируемый slug, клик по сегменту |
| — | `Ctrl+1…6` — зоны; deep-route + modal stack (`routeStore`) |

Файлы: `frontend/src/shell/zones.ts`, `routes.ts`, `routeStore.ts`, `PathCrumbs.tsx`, `App.tsx`.

Десктоп-порт этой IA — **позже** (не в этом коммите).

---

## 2. Бортжурнал (`bridge/log`)

| Тема | Desktop | Web (после правок) |
| --- | --- | --- |
| Heatmap | Canvas, `heat_color(rate×4)`, % на клавише | Glass: заливка через `--st-frame-fill`; шкала **green→amber→red по сырому %**; **числа на клавишах убраны** |
| Слабые клавиши | Текст `«x» 60% (3 из 5)` | **Мини-клавиши** с буквой и цветом heatmap + % + `(ошибки из всего)`; **2 колонки**, до 12 ключей |
| Динамика / клавиатура | Фиксированная раскладка | Компактный блок динамики — heatmap не обрезается снизу |

Файлы: `Heatmap.tsx`, `heatmapColor.ts`, `FlightLogPanel.tsx`, `index.css`.

---

## 3. Сканер английского

| Тема | Desktop | Web |
| --- | --- | --- |
| Единый вход в сканер | Один экран | Все входы → `ScannerPage` (не пустая форма) |
| Панель «Данные объекта» | Кнопки + tr | Шире `my_tr`; подписи как на десктопе: ○ НЕ ЗНАЮ / ⊞ В ОТСЕК / В ПРОВЕРКУ |
| Mic / ASR | Vosk | **Не трогали** (заморожено) |

Файлы: `ScannerPage.tsx`, `EnglishPanel.tsx`, CSS.

---

## 4. Настройки

| Вкладка | Решение |
| --- | --- |
| Системы / Ещё / **Скины** / **Экипаж** | Остаются в `settings` (дубль скинов/экипажа допустим) |
| Библиотека / 2 языка (читалка) | **Убраны** из общих настроек — только зона **Скорочтение** (`speed/library`, `speed/reader`) |

Файл: `SettingsHub.tsx`, `shell/routes.ts`.

---

## 5. Layout / стекло

- `english/book` — список со скроллом, последняя строка не режется.
- Glass: заливка только через `--st-frame-fill` (не `background` — иначе «просто космос»).
- Подменю мостика / SR выровнены по стилю EN-nav.

---

## 6. Что ещё не = desktop (хвосты)

| Тема | Статус |
| --- | --- |
| SQL-пагинация `/set/{id}` (S-20K) | P0.1 — в backlog |
| Плотность EN-карт / сканер в один кадр | P0.2–P0.3 |
| Подсветка целевой клавиши на мостике | отложено |
| IA зон на десктопе | позже |

Подробнее: в монорепо `docs/web/ENGLISH_PARITY_GAPS.md`, `docs/web/STATUS.md` (локально у разработчика).

---

## 7. Ключевые файлы сессии

```
frontend/src/shell/{zones,routes,routeStore,PathCrumbs}.tsx|.ts
frontend/src/App.tsx
frontend/src/bridge/{Heatmap,heatmapColor,heatmap.test}.*
frontend/src/flightlog/FlightLogPanel.tsx
frontend/src/english/{EnglishPanel,ScannerPage}.tsx
frontend/src/settings/SettingsHub.tsx
frontend/src/index.css
frontend/src/viewportFit.css
frontend/src/i18n/setup.ts
```

Проверка: `docker compose up -d --build frontend`, затем Ctrl+F5.
