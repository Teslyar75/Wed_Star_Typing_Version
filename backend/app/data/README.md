# Словари вкладки «Английский» (веб)

Копии из десктопа `stamina/english/data/`. Веб-репозиторий **самодостаточен**: не читает соседний клон My_Stamina.

| Файл / каталог | Содержание |
| --- | --- |
| `vocab.json` | ~20 000 слов (частотные S-1000…S-20K) |
| `vocab_dev.json` | ~580 IT-терминов (S-DEV / IT Interview) |
| `vocab_seed.json` | Компактный fallback (~2k), если полные файлы недоступны |
| `english/sets/` | CEFR A1–C2 (**8648** карточек), см. `english/README.md` |
| `english/verbs/` | Неправильные + frequent_1000 |

CEFR/verbs: `./scripts/sync-english-data.sh /path/to/My_Stamina`.  
Docker монтирует `backend/app/data/english` → `/english-data` (не `../stamina/...`).

Лицензии: CC BY-SA 4.0 (vocab) / CC BY 4.0 CodersLingo (dev); CEFR-J / Tatoeba / Wiktionary — как в JSON `source`.
