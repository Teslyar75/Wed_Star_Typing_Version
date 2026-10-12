from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./star_typing_web.db"
    secret_key: str = "dev-star-typing-change-me-32bytes!!"
    stamina_repo_root: Path | None = None

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
