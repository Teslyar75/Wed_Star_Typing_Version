# Прогресс (факты)

Обновлять **после** push/CI, не до. Зелёный = завершённый GitHub check, не running и не только локальный прогон.

Репозиторий: [Teslyar75/Wed_Star_Typing_Version](https://github.com/Teslyar75/Wed_Star_Typing_Version)  
Actions: [https://github.com/Teslyar75/Wed_Star_Typing_Version/actions](https://github.com/Teslyar75/Wed_Star_Typing_Version/actions)

## Ветки / PR

| Этап | SHA | Ветка | PR | GitHub CI | Docker | Примечание |
| --- | --- | --- | --- | --- | --- | --- |
| master | `667df0f` | `master` | — | — | — | S0–S3 + PR21/22 влиты |
| S0 | — | — | [#17](https://github.com/Teslyar75/Wed_Star_Typing_Version/pull/17) | merged | — | e2e CI |
| S1 | — | — | [#18](https://github.com/Teslyar75/Wed_Star_Typing_Version/pull/18) | merged | — | зоны / EN lifecycle |
| S2 | — | — | [#19](https://github.com/Teslyar75/Wed_Star_Typing_Version/pull/19) | merged | — | Документы MVP |
| S3 | — | — | [#20](https://github.com/Teslyar75/Wed_Star_Typing_Version/pull/20) | merged | — | Эфир = чат пилотов |
| S4 (часть) | — | — | [#21](https://github.com/Teslyar75/Wed_Star_Typing_Version/pull/21), [#22](https://github.com/Teslyar75/Wed_Star_Typing_Version/pull/22) | merged | — | Орион вкладки, журнал, дзен, autoupdate; остаток — polish `task_progress` |
| CEFR / settings / no-scroll / docs parity | (этот PR) | `cursor/cefr-lazy-parity-acfe` | открывается | смотреть Actions | смотреть | vendored 8648, lazy page, UI scale, DOCUMENTS_PARITY |
| S5–S7 | — | — | — | — | — | не начаты |

`gh` — только чтение. Создавать/обновлять PR — `ManagePullRequest`.

## Решения (коротко)

| Когда | Решение |
| --- | --- |
| 08.11 S0–S3 | очередь и merge-запрет без явного указания Сергея |
| 08.11 10:38 | S3 Эфир = зона `comm`, не радио |
| 11.11 | master содержит PR17–22; следующий PR — от master |
| 11.11 | CEFR: данные vendored в `backend/app/data/english`; карточки без примеров показываются; страница 24; `/cefr/counts` отдельно |
| 11.11 | Документы: сверка → [DOCUMENTS_PARITY.md](./DOCUMENTS_PARITY.md); крупные пробелы не закрывать сейчас |
| 11.11 | Эфир roadmap: рост до чата с картинками/вложениями — архитектура расширяема, реализация позже |

## Локальные прогоны vs CI

В отчёте всегда разделять:

- **Локально:** команда + число passed (этот агент / эта машина).
- **GitHub Actions:** URL run, conclusion success/failure/**in_progress**.

Не писать «CI зелёный», если checks ещё running.
