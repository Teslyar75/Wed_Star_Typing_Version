# Vosk model (опционально)

```powershell
cd frontend
npm run fetch:vosk
```

Скачает `vosk-model-small-en-us.tar.gz` (~40 MB) в эту папку. Файл в `.gitignore`.

После этого ASR в «Английский» предпочтёт vosk-browser; иначе — Web Speech API.
