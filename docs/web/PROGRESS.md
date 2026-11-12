# Прогресс (факты)

Обновлять **после** push/CI, не до. Зелёный = завершённый GitHub check, не running и не только локальный прогон.

Репозиторий: [Teslyar75/Wed_Star_Typing_Version](https://github.com/Teslyar75/Wed_Star_Typing_Version)  
Actions: [https://github.com/Teslyar75/Wed_Star_Typing_Version/actions](https://github.com/Teslyar75/Wed_Star_Typing_Version/actions)

## Ветки / PR

| Этап | SHA | Ветка | PR | GitHub CI | Docker | Примечание |
| --- | --- | --- | --- | --- | --- | --- |
| Орион guide jokes/facts full port | `b88dffa` | `cursor/orion-guide-content-648e` | [#32](https://github.com/Teslyar75/Wed_Star_Typing_Version/pull/32) | pending | pending | desktop guide_idle 60+60; remember kind; ONLINE ambient |
| master | `6f5a902` | `master` | — | — | — | после PR #30/#31 |
| OpenCode автопорт (10013) | `580e9b4` | `cursor/opencode-port-auto-06a2` | [#27](https://github.com/Teslyar75/Wed_Star_Typing_Version/pull/27) | **5/5 SUCCESS** | **SUCCESS** | **merged** → `33ec4cf`; автопорт + `ORION_SILENT_SAY=1` |
| Орион индикатор связи | `ce190b1` | `cursor/orion-link-indicator-dc67` | [#28](https://github.com/Teslyar75/Wed_Star_Typing_Version/pull/28) | **5/5 SUCCESS** | **SUCCESS** | **merged** → `72721c8`; health + индикатор |
| Security: texts ACL + upload limits + SSRF | *(merge master)* | `cursor/security-text-access-e31f` | [#30](https://github.com/Teslyar75/Wed_Star_Typing_Version/pull/30) | pending | pending | auth+pilot_texts/is_public; 413; SSRF; после merge master (PR27–29) |
| Орион Agents layout (no-scroll) | `202de6b` | `cursor/orion-agents-layout-15ea` | [#25](https://github.com/Teslyar75/Wed_Star_Typing_Version/pull/25) | **5/5 SUCCESS** | **SUCCESS** | **merged** Сергеем в `cc7afac` |
| S0 | — | — | [#17](https://github.com/Teslyar75/Wed_Star_Typing_Version/pull/17) | merged | — | e2e CI |
| S1 | — | — | [#18](https://github.com/Teslyar75/Wed_Star_Typing_Version/pull/18) | merged | — | зоны / EN lifecycle |
| S2 | — | — | [#19](https://github.com/Teslyar75/Wed_Star_Typing_Version/pull/19) | merged | — | Документы MVP |
| S3 | — | — | [#20](https://github.com/Teslyar75/Wed_Star_Typing_Version/pull/20) | merged | — | Эфир = чат пилотов |
| S4 (часть) | — | — | [#21](https://github.com/Teslyar75/Wed_Star_Typing_Version/pull/21), [#22](https://github.com/Teslyar75/Wed_Star_Typing_Version/pull/22) | merged | — | Орион вкладки, журнал, дзен, autoupdate; остаток — polish `task_progress` |
| CEFR / settings / no-scroll / docs matrix | — | — | [#23](https://github.com/Teslyar75/Wed_Star_Typing_Version/pull/23) | merged | — | DOCUMENTS_PARITY.md на master |
| Документы: закрытие пробелов parity | `f693ed1` | `cursor/docs-parity-gaps-84c6` | [#24](https://github.com/Teslyar75/Wed_Star_Typing_Version/pull/24) | **5/5 SUCCESS** | **SUCCESS** | корзина, шаблоны, MD-лента, import/export, find/undo, TTS |
| Эфир HUD + chat reuse / Docs `.btn`→HUD | `89c0a21` | `cursor/comm-hud-buttons-fd24` | [#29](https://github.com/Teslyar75/Wed_Star_Typing_Version/pull/29) | **5/5 SUCCESS** | **SUCCESS** | пилот↔пилот; `.btn` alias `hud-btn`; вложения; см. COMM_ETHER_WEB.md |
| S5–S7 | — | — | — | — | — | не начаты |

`gh` — только чтение. Создавать/обновлять PR — `ManagePullRequest`.

## Решения (коротко)

| Когда | Решение |
| --- | --- |
| 08.11 S0–S3 | очередь и merge-запрет без явного указания Сергея |
| 08.11 10:38 | S3 Эфир = зона `comm`, не радио |
| 11.11 | master содержит PR17–22; следующий PR — от master |
| 11.11 | CEFR: данные vendored в `backend/app/data/english`; карточки без примеров показываются; страница 24; `/cefr/counts` отдельно |
| 11.11 | Документы: сверка → [DOCUMENTS_PARITY.md](./DOCUMENTS_PARITY.md) (PR #23) |
| 11.11 CI | PR #23 HEAD `679e7e5`: **GitHub 5/5 SUCCESS** (backend/frontend/e2e + Docker×2). |
| 11.11 | Эфир roadmap: рост до чата с картинками/вложениями — архитектура расширяема, реализация позже |
| 11.11 | Документы: закрытие пробелов parity (корзина, шаблоны, MD-лента, import/export, find/undo, preview, TTS); PDF=Print; visual=preview-вкладка; LLM/почта — вне очереди |
| 11.11 CI | PR #24 HEAD `f693ed1`: **GitHub 5/5 SUCCESS** (backend/frontend/e2e + Docker×2). Merge не делали. |
| 11.11 | Орион `agents`: карточка и привязка в две колонки, узкий список, evo-strip, манеры/режим во вкладках |
| 11.11 CI | PR #25 HEAD `dd9ddcc`/`202de6b`: **GitHub 5/5 SUCCESS**; merge Сергеем → master `cc7afac`. |
| 11.11 | Security backend: тексты только через cookie-пилот + `pilot_texts`; Gutenberg `is_public` (read-only без полки); upload limits + epub zip-bomb; SSRF (ICY/Gutenberg/BYO). |
| 11.11 CI | PR #30 HEAD `9f35b3e`: **GitHub 5/5 SUCCESS** (backend/frontend/e2e + Docker×2). Merge не делали. |

| 11.11 CI | PR #28 HEAD `5581f87`: **GitHub 5/5 SUCCESS** (backend/frontend/e2e + Docker×2). Merge не делали. |

## Локальные прогоны vs CI

В отчёте всегда разделять:

- **Локально:** команда + число passed (этот агент / эта машина).
- **GitHub Actions:** URL run, conclusion success/failure/**in_progress**.

Не писать «CI зелёный», если checks ещё running.
