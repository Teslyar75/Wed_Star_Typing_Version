# English packs (vendored)

Копии из десктопа `My_Stamina` → `stamina/english/data/` (эталон **3.8.3** `9622f3e`).

| Путь | Содержание |
| --- | --- |
| `sets/cefr_*.json` | CEFR A1–C2 · одно слово = одна карточка · **8648** слов (`cefr_report.json`) |
| `verbs/*.json` | Неправильные + frequent_1000 |

Веб-репозиторий **самодостаточен**: `english_packs.data_dir()` сначала смотрит сюда, Docker монтирует эту папку в `/english-data`. Соседний клон десктопа не обязателен.

Обновление из десктопа:

```bash
./scripts/sync-english-data.sh /path/to/My_Stamina
```

Карточки без примеров **не отбрасываются** (в отличие от desktop `MIN_SENTENCES=1` в `prepared_view`): счётчики совпадают с `cefr_report.json`, UI показывает слово/перевод/определение. Контент отдаётся лениво: `GET /api/english/cefr/{level}?block=&page=&page_size=24` — не весь уровень и не весь архив.
