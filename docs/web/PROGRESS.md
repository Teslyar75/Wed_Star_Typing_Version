# Прогресс (факты)

Обновлять **после** push/CI, не до. Зелёный = завершённый GitHub check, не running и не только локальный прогон.

Репозиторий: [Teslyar75/Wed_Star_Typing_Version](https://github.com/Teslyar75/Wed_Star_Typing_Version)  
Actions: [https://github.com/Teslyar75/Wed_Star_Typing_Version/actions](https://github.com/Teslyar75/Wed_Star_Typing_Version/actions)

## Ветки / PR

| Этап | SHA | Ветка | PR | GitHub CI | Docker | Примечание |
| --- | --- | --- | --- | --- | --- | --- |
| master (не вливать очередь сюда) | `a6142bf` | `master` | — | — | — | база до S0 |
| S0 | `462bc08` | `cursor/s0-e2e-ci-2598` | [#17](https://github.com/Teslyar75/Wed_Star_Typing_Version/pull/17) | был green на этом SHA (проверить latest) | по PR | merge **не** делали |
| S1 | `7c9a276` | `cursor/s1-zones-en-lifecycle-2598` | [#18](https://github.com/Teslyar75/Wed_Star_Typing_Version/pull/18) | был green на этом SHA | по PR | base = S0 ветка; merge **не** делали |
| S2 | `d45e1bd` | `cursor/s2-docs-mvp-2598` | [#19](https://github.com/Teslyar75/Wed_Star_Typing_Version/pull/19) | **GitHub 5/5 SUCCESS** CI `42462921472`, Docker `42462921491` | Docker green на PR | Merge не делать |
| S3 | `b8b85c4` | `cursor/s3-ether-2598` | [#20](https://github.com/Teslyar75/Wed_Star_Typing_Version/pull/20) | **локально** vitest 209 / pytest 171 / e2e 42 / build ok. GitHub CI смотреть Actions, не путать | Docker-демона здесь нет; на PR — docker-smoke | база S2 `d45e1bd`. Чат пилотов (`comm`), не radio. Merge не делать |
| S4–S7 | — | — | — | — | — | не начаты |

Проверять remote перед зависимостью:

```bash
git fetch origin cursor/s0-e2e-ci-2598 cursor/s1-zones-en-lifecycle-2598 cursor/s2-docs-mvp-2598
git log -1 --oneline origin/cursor/s1-zones-en-lifecycle-2598
gh pr view 17 --json number,state,headRefOid,url
gh pr view 18 --json number,state,headRefOid,url
```

`gh` — только чтение. Создавать/обновлять PR — `ManagePullRequest`.

## Решения (коротко)

| Когда | Решение |
| --- | --- |
| 08.11 S0 | e2e sqlite изолирован (`star_typing_web_e2e.db`, WAL, 1 worker). Профили пилота не трогали. |
| 08.11 S1 | Зоны из `ZONE_ORDER`; Docs/Comm тогда отложены. Радио-хост не размонтировать. |
| 08.11 | GitHub SoT: Origin `stack_on` отклонён. Зависимость = `base_branch` + ссылки на PR в теле. |
| 08.11 S2 | Документы перед Орионом → 8 зон. SQL + cookie isolation. Print = браузер, не вызывать в тестах. Версии 10 мин / 20 шт. как desktop. Картинки/почта/export — не S2. |
| 08.11 10:12 | Весь оставшийся веб-план разрешён; после зелёного этапа идти дальше без «продолжай». |
| 08.11 10:14 | Прямой чат Сергея с Cursor достаточен. Merge только явным указанием + green latest. |
| 08.11 10:36–10:38 | S3 Эфир = зона `comm` (desktop COMM_ETHER). Активный чат пилотов. Не полный клон Ориона/Документов; только механики чата. Радио «эфир» — другое. |

## Локальные прогоны vs CI

В отчёте всегда разделять:

- **Локально:** команда + число passed (этот агент / эта машина).
- **GitHub Actions:** URL run, conclusion success/failure/**in_progress**.

Не писать «CI зелёный», если checks ещё running.
