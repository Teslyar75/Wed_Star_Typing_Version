from unittest.mock import MagicMock, patch

from app.icy import _host_ok, fetch_icy_title


def test_blocks_localhost() -> None:
    assert _host_ok("localhost") is False
    assert _host_ok("127.0.0.1") is False


def test_fetch_bad_scheme() -> None:
    assert fetch_icy_title("ftp://example.com/x") is None
    assert fetch_icy_title("file:///etc/passwd") is None


def test_parses_stream_title() -> None:
    meta_int = 8
    audio = b"A" * meta_int
    title = b"StreamTitle='Song - Artist';"
    pad = (16 - len(title) % 16) % 16
    meta_padded = title + b"\x00" * pad
    length_byte = bytes([len(meta_padded) // 16])
    payload = audio + length_byte + meta_padded

    mock_resp = MagicMock()
    mock_resp.headers = {"icy-metaint": str(meta_int)}
    mock_resp.read = MagicMock(side_effect=[payload, b""])
    mock_resp.__enter__ = MagicMock(return_value=mock_resp)
    mock_resp.__exit__ = MagicMock(return_value=False)

    with (
        patch("app.icy._host_ok", return_value=True),
        patch("app.icy.urllib.request.urlopen", return_value=mock_resp),
    ):
        got = fetch_icy_title("https://stream.example.com/live")
    assert got == "Song - Artist"


def test_nowplaying_endpoint() -> None:
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    r = client.get("/api/radio/nowplaying", params={"url": "not-a-url"})
    assert r.status_code == 400
