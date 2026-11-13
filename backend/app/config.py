from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


DEFAULT_SECRET = "dev-star-typing-change-me-32bytes!!"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./star_typing_web.db"
    secret_key: str = DEFAULT_SECRET
    # dev: разрешить встроенный ключ (только локально/тесты). В проде задайте SECRET_KEY.
    allow_dev_secret: bool = False
    secret_key_file: str = "./.jwt_secret"
    stamina_repo_root: Path | None = None
    # READ-ONLY каталог %APPDATA%\Stamina (хоста) для переноса профиля по имени + PIN.
    # Пусто = функция выключена (503 desktop_data_unavailable).
    desktop_data_dir: str = ""
    # Слайдшоу (E2): ключи только из окружения/.env (в git не попадают).
    unsplash_access_key: str = ""
    pexels_api_key: str = ""
    # Орион (docs/WEB_PORT_PLAN.md «Орион в вебе»): только env/.env, в коде ключей нет.
    orion_llm_provider: str = "openai"  # openai | anthropic
    orion_llm_base_url: str = ""
    orion_llm_model: str = ""
    orion_llm_api_key: str = ""
    orion_llm_vision: bool = False
    orion_llm_timeout: float = 30.0
    orion_hosted_enabled: bool = False
    orion_admin_token: str = ""
    orion_contrib_enabled: bool = False
    orion_contrib_rate_per_hour: int = 5
    orion_chat_rate_per_min: int = 20
    orion_byo_allow_http: bool = False
    orion_byo_allow_private: bool = False
    orion_opencode_url: str = "http://host.docker.internal:8765"
    orion_opencode_token: str = ""
    orion_opencode_timeout: float = 180.0
    orion_opencode_model: str = "opencode/deepseek-v4.1-flash-free"
    # Runtime-файл моста (порт после автовыбора). В Docker: /runtime/opencode_bridge.json
    orion_opencode_runtime: str = "/runtime/opencode_bridge.json"
    web_update_url: str = "http://host.docker.internal:8766"
    web_update_token: str = ""
    web_update_timeout: float = 30.0
    # Лимиты загрузок (байты / символы). Env: UPLOAD_MAX_BOOK_BYTES и т.д.
    upload_max_book_bytes: int = 20 * 1024 * 1024
    upload_max_image_bytes: int = 400_000
    upload_max_doc_bytes: int = 8 * 1024 * 1024
    upload_max_text_chars: int = 2_000_000
    upload_max_epub_uncompressed: int = 80 * 1024 * 1024

    def repo_root(self) -> Path:
        """Корень с пакетом stamina (соседний клон My_Stamina) или этот репозиторий."""
        if self.stamina_repo_root:
            return Path(self.stamina_repo_root)
        here = Path(__file__).resolve()
        # backend/app → repo root (Wed_Star_Typing_Version)
        web_root = here.parents[2]
        # соседний монорепо при локальной разработке рядом
        sibling = web_root.parent / "My_New_Stamina"
        if (sibling / "stamina").is_dir():
            return sibling
        return web_root


settings = Settings()


WEAK_SECRETS = {DEFAULT_SECRET, "change-me-in-prod", "changeme", "secret", ""}


def check_secret() -> None:
    """Никогда не подписывать вход встроенным ключом.

    1) SECRET_KEY из окружения (>=32 символов) — используется он;
    2) иначе ключ читается/создаётся случайным в SECRET_KEY_FILE (по умолчанию ./.jwt_secret);
    3) ALLOW_DEV_SECRET=1 — разрешить встроенный ключ (только тесты).
    """
    import os
    import secrets as _secrets

    key = settings.secret_key or ""
    if key not in WEAK_SECRETS:
        if len(key) < 32:
            raise RuntimeError("SECRET_KEY слишком короткий (нужно >=32 символа)")
        return
    if settings.allow_dev_secret:
        return
    path = Path(settings.secret_key_file)
    if path.is_file() and len(path.read_text(encoding="utf-8").strip()) >= 32:
        settings.secret_key = path.read_text(encoding="utf-8").strip()
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    new = _secrets.token_urlsafe(48)
    path.write_text(new, encoding="utf-8")
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    settings.secret_key = new
