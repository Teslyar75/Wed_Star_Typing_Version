"""HD-озвучка: нейроголоса Microsoft через edge-tts, mp3 с дисковым кэшем.

GET /api/tts/voices        — курированный список нейроголосов (en/ru/uk/de)
GET /api/tts?text=&voice=&rate=  — audio/mpeg; кэш по sha1(voice|rate|text)
Если сеть/edge-tts недоступны — 503, фронт падает на Web Speech API.
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

router = APIRouter(prefix="/api/tts", tags=["tts"])

# id, язык, акцент, пол
VOICES: list[dict[str, str]] = [
    {"id": "en-US-AriaNeural", "lang": "en", "accent": "US", "gender": "F", "name": "Aria"},
    {"id": "en-US-JennyNeural", "lang": "en", "accent": "US", "gender": "F", "name": "Jenny"},
    {"id": "en-US-EmmaNeural", "lang": "en", "accent": "US", "gender": "F", "name": "Emma"},
    {"id": "en-US-AvaNeural", "lang": "en", "accent": "US", "gender": "F", "name": "Ava"},
    {"id": "en-US-GuyNeural", "lang": "en", "accent": "US", "gender": "M", "name": "Guy"},
    {"id": "en-US-AndrewNeural", "lang": "en", "accent": "US", "gender": "M", "name": "Andrew"},
    {"id": "en-US-BrianNeural", "lang": "en", "accent": "US", "gender": "M", "name": "Brian"},
    {"id": "en-US-ChristopherNeural", "lang": "en", "accent": "US", "gender": "M", "name": "Christopher"},
    {"id": "en-GB-SoniaNeural", "lang": "en", "accent": "UK", "gender": "F", "name": "Sonia"},
    {"id": "en-GB-LibbyNeural", "lang": "en", "accent": "UK", "gender": "F", "name": "Libby"},
    {"id": "en-GB-RyanNeural", "lang": "en", "accent": "UK", "gender": "M", "name": "Ryan"},
    {"id": "en-GB-ThomasNeural", "lang": "en", "accent": "UK", "gender": "M", "name": "Thomas"},
    {"id": "en-AU-NatashaNeural", "lang": "en", "accent": "AU", "gender": "F", "name": "Natasha"},
    {"id": "en-AU-WilliamMultilingualNeural", "lang": "en", "accent": "AU", "gender": "M", "name": "William"},
    {"id": "en-CA-ClaraNeural", "lang": "en", "accent": "CA", "gender": "F", "name": "Clara"},
    {"id": "en-IE-EmilyNeural", "lang": "en", "accent": "IE", "gender": "F", "name": "Emily"},
    {"id": "en-IN-NeerjaNeural", "lang": "en", "accent": "IN", "gender": "F", "name": "Neerja"},
    {"id": "ru-RU-SvetlanaNeural", "lang": "ru", "accent": "RU", "gender": "F", "name": "Светлана"},
    {"id": "ru-RU-DmitryNeural", "lang": "ru", "accent": "RU", "gender": "M", "name": "Дмитрий"},
    {"id": "uk-UA-PolinaNeural", "lang": "uk", "accent": "UA", "gender": "F", "name": "Поліна"},
    {"id": "uk-UA-OstapNeural", "lang": "uk", "accent": "UA", "gender": "M", "name": "Остап"},
    {"id": "de-DE-KatjaNeural", "lang": "de", "accent": "DE", "gender": "F", "name": "Katja"},
    {"id": "de-DE-ConradNeural", "lang": "de", "accent": "DE", "gender": "M", "name": "Conrad"},
    {"id": "de-DE-AmalaNeural", "lang": "de", "accent": "DE", "gender": "F", "name": "Amala"},
]
VOICE_IDS = {v["id"] for v in VOICES}
DEFAULT_VOICE = {"en": "en-US-AriaNeural", "ru": "ru-RU-SvetlanaNeural", "uk": "uk-UA-PolinaNeural", "de": "de-DE-KatjaNeural"}
MAX_CHARS = 1000


def cache_dir() -> Path:
    d = Path(os.environ.get("TTS_CACHE_DIR") or Path(__file__).resolve().parents[1] / "data_cache" / "tts")
    d.mkdir(parents=True, exist_ok=True)
    return d


def rate_str(rate: float) -> str:
    """1.0 → '+0%', 0.8 → '-20%' (формат edge-tts)."""
    pct = round((max(0.5, min(2.0, rate)) - 1.0) * 100)
    return f"{pct:+d}%"


def cache_key(text: str, voice: str, rate: float) -> str:
    return hashlib.sha1(f"{voice}|{rate_str(rate)}|{text}".encode("utf-8")).hexdigest()


async def synth(text: str, voice: str, rate: float, out: Path) -> None:
    import edge_tts

    tmp = out.with_suffix(".part")
    comm = edge_tts.Communicate(text, voice, rate=rate_str(rate))
    with tmp.open("wb") as f:
        async for chunk in comm.stream():
            if chunk.get("type") == "audio":
                f.write(chunk["data"])
    if tmp.stat().st_size == 0:
        tmp.unlink(missing_ok=True)
        raise RuntimeError("empty audio")
    tmp.replace(out)


@router.get("/voices")
def voices() -> dict:
    return {"voices": VOICES, "defaults": DEFAULT_VOICE}


@router.get("")
async def tts(
    text: str = Query(..., min_length=1, max_length=MAX_CHARS),
    voice: str = Query("en-US-AriaNeural"),
    rate: float = Query(1.0, ge=0.5, le=2.0),
):
    text = text.strip()
    if not text:
        raise HTTPException(400, "empty text")
    if voice not in VOICE_IDS:
        raise HTTPException(400, "unknown voice")
    out = cache_dir() / f"{cache_key(text, voice, rate)}.mp3"
    if not out.exists():
        try:
            await synth(text, voice, rate, out)
        except Exception as e:  # сеть / сервис недоступны → фронт уйдёт на браузерный голос
            raise HTTPException(503, f"tts unavailable: {type(e).__name__}") from e
    return FileResponse(out, media_type="audio/mpeg", headers={"Cache-Control": "public, max-age=31536000"})
