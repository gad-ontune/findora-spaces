from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"), env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "Findora Spaces"
    environment: Literal["development", "staging", "production", "test"] = "development"
    debug: bool = True
    api_v1_prefix: str = "/api/v1"
    secret_key: str = "dev-only-secret-change-me"
    frontend_url: str = "http://localhost:3000"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    database_url: str = (
        "postgresql+psycopg://findora:findora_dev_password@localhost:5455/findora"
    )
    redis_url: str = "redis://localhost:6380/0"
    auto_create_tables: bool = True

    session_cookie_name: str = "findora_session"
    csrf_cookie_name: str = "findora_csrf"
    session_ttl_hours: int = 168
    cookie_secure: bool = False
    otp_debug: bool = True
    otp_ttl_minutes: int = 10
    login_max_attempts: int = 8

    upload_dir: str = "uploads"
    public_media_base: str = "/media"
    max_upload_mb: int = 25
    s3_bucket: str = ""
    s3_region: str = ""
    s3_endpoint_url: str = ""
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    cdn_base_url: str = ""

    map_tile_style_url: str = "https://tiles.openfreemap.org/styles/liberty"
    geocoding_provider_url: str = "https://nominatim.openstreetmap.org"

    mpesa_env: str = "sandbox"
    mpesa_consumer_key: str = ""
    mpesa_consumer_secret: str = ""
    mpesa_shortcode: str = "174379"
    mpesa_passkey: str = ""
    mpesa_callback_url: str = "http://localhost:8000/api/v1/payments/callback"
    mpesa_callback_secret: str = "dev-callback-secret"
    mpesa_mock: bool = True

    sms_provider: str = "mock"
    sms_api_key: str = ""
    sms_sender_id: str = "FINDORA"
    email_provider: str = "mock"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    email_from: str = "hello@findora.co.ke"
    whatsapp_provider: str = "mock"
    whatsapp_token: str = ""
    whatsapp_phone_id: str = ""

    default_freshness_days: int = 14
    availability_reminder_days: int = 3

    @field_validator("secret_key")
    @classmethod
    def warn_production_secret(cls, value: str) -> str:
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
