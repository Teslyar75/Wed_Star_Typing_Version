"""Серверный Vosk ASR — та же модель, что на десктопе (models/vosk-model-*)."""

from __future__ import annotations

import io
import json
import os
import threading
import wave
from pathlib import Path

from app.config import settings

SAMPLE_RATE = 16000
_lock = threading.Lock()
_model = None
_model_error: str | None = None
_model_path: Path | None = None


def _candidate_dirs() -> list[Path]:
    env = os.environ.get("VOSK_MODEL_DIR", "").strip()
    out: list[Path] = []
    if env:
        out.append(Path(env))
    # docker volume /models/...
    out.append(Path("/models/vosk-model-small-en-us-0.15"))
    out.append(Path("/models"))
    repo = settings.repo_root()
    out.append(repo / "models" / "vosk-model-small-en-us-0.15")
    out.append(repo / "models")
    # monorepo: web_star_typing → parent My_New_Stamina
    web_root = Path(__file__).resolve().parents[2]
    out.append(web_root.parent / "models" / "vosk-model-small-en-us-0.15")
    out.append(web_root.parent / "models")
    return out


def find_model_dir() -> Path | None:
    for base in _candidate_dirs():
        if not base.exists():
            continue
        if base.is_dir() and (base / "am").exists():
            return base
        if base.is_dir():
            for p in sorted(base.iterdir()):
                if p.is_dir() and p.name.startswith("vosk-model") and (p / "am").exists():
                    return p
    return None


def asr_status() -> dict:
    path = find_model_dir()
    try:
        import vosk  # noqa: F401

        vosk_ok = True
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "reason": f"vosk not installed: {exc}", "model": None}
    if path is None:
        return {"ok": False, "reason": "vosk model not found", "model": None}
    return {"ok": True, "reason": "ready", "model": str(path)}


def _ensure_model():
    global _model, _model_error, _model_path
    with _lock:
        if _model is not None:
            return _model
        if _model_error:
            raise RuntimeError(_model_error)
        path = find_model_dir()
        if path is None:
            _model_error = "vosk model not found"
            raise RuntimeError(_model_error)
        try:
            import vosk

            vosk.SetLogLevel(-1)
            _model = vosk.Model(str(path))
            _model_path = path
            return _model
        except Exception as exc:  # noqa: BLE001
            _model_error = str(exc)
            raise


def _alts(raw: str) -> list[str]:
    try:
        d = json.loads(raw)
    except ValueError:
        return []
    if "alternatives" in d:
        return [a.get("text", "") for a in d["alternatives"] if isinstance(a, dict)]
    text = d.get("text", "")
    return [text] if text else []


def _pcm_from_wav(data: bytes) -> bytes:
    with wave.open(io.BytesIO(data), "rb") as wf:
        channels = wf.getnchannels()
        width = wf.getsampwidth()
        rate = wf.getframerate()
        frames = wf.readframes(wf.getnframes())
    if width != 2:
        raise ValueError(f"need 16-bit PCM, got sample width {width}")
    # mono
    if channels > 1:
        import array

        a = array.array("h")
        a.frombytes(frames)
        mono = array.array("h", (a[i] for i in range(0, len(a), channels)))
        frames = mono.tobytes()
    if rate != SAMPLE_RATE:
        frames = _resample_i16(frames, rate, SAMPLE_RATE)
    return frames


def _resample_i16(pcm: bytes, src_rate: int, dst_rate: int) -> bytes:
    if src_rate == dst_rate:
        return pcm
    import array

    a = array.array("h")
    a.frombytes(pcm[: len(pcm) - len(pcm) % 2])
    if not a:
        return b""
    ratio = src_rate / dst_rate
    n_out = max(1, int(len(a) / ratio))
    out = array.array("h")
    for i in range(n_out):
        src_i = int(i * ratio)
        if src_i >= len(a):
            break
        out.append(a[src_i])
    return out.tobytes()


def recognize_wav(data: bytes) -> list[str]:
    """Распознать WAV (mono/stereo, 16-bit). Возвращает альтернативы текста."""
    pcm = _pcm_from_wav(data)
    return recognize_pcm(pcm)


def recognize_pcm(pcm: bytes) -> list[str]:
    model = _ensure_model()
    import vosk

    rec = vosk.KaldiRecognizer(model, SAMPLE_RATE)
    try:
        rec.SetMaxAlternatives(5)
    except Exception:  # noqa: BLE001
        pass
    # chunk to avoid huge single AcceptWaveform
    step = 8000 * 2  # 0.5 s
    alts: list[str] = []
    for i in range(0, len(pcm), step):
        chunk = pcm[i : i + step]
        if rec.AcceptWaveform(chunk):
            got = [a for a in _alts(rec.Result()) if a.strip()]
            if got:
                alts = got
    final = [a for a in _alts(rec.FinalResult()) if a.strip()]
    if final:
        alts = final
    # unique keep order
    seen: set[str] = set()
    out: list[str] = []
    for a in alts:
        k = a.strip().lower()
        if k and k not in seen:
            seen.add(k)
            out.append(a.strip())
    return out
