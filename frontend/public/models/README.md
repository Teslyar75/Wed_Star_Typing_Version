# Vosk model (опционально)

Чтобы включить vosk-browser:

1. Скачайте `vosk-model-small-en-us-0.15` с https://alphacephei.com/vosk/models
2. Положите архив как `vosk-model-small-en-us.tar.gz` в эту папку
3. `npm i vosk-browser` во `frontend/`
4. Допишите загрузку модели в `src/english/asr.ts` → `listenWithVosk`

Пока ASR работает через Web Speech API + `textutil` scoring.
