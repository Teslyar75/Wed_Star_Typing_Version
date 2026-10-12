# Vosk model (опционально)

```powershell
cd frontend
npm run fetch:vosk
```

Скачает `vosk-model-small-en-us.tar.gz` (~40 MB) в эту папку. Файл в `.gitignore`.

После первой загрузки браузер кладёт архив в **IndexedDB** (`star-typing-vosk`) — следующие сессии ASR не требуют повторной сети к файлу модели.

ASR в «Английский» предпочитает vosk-browser; иначе — Web Speech API.
