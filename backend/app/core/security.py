from __future__ import annotations

import hashlib
import hmac
import re
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.core.config import settings

password_hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)
serializer = URLSafeTimedSerializer(settings.secret_key, salt="findora-signed")


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return password_hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError, ValueError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    try:
        return password_hasher.check_needs_rehash(password_hash)
    except Exception:
        return False


def normalize_phone(raw: str) -> str:
    """Normalize Kenyan phone numbers to +2547XXXXXXXX / +2541XXXXXXXX.

    Falls back to a compact international representation for non-Kenyan input.
    """
    if not raw:
        raise ValueError("Phone number is required")
    cleaned = re.sub(r"[^\d+]", "", raw.strip())
    if cleaned.startswith("00"):
        cleaned = "+" + cleaned[2:]
    if cleaned.startswith("0") and len(cleaned) >= 10:
        cleaned = "+254" + cleaned[1:]
    elif cleaned.startswith("254"):
        cleaned = "+" + cleaned
    elif cleaned.startswith("+254"):
        pass
    elif not cleaned.startswith("+"):
        cleaned = "+" + cleaned
    digits = re.sub(r"\D", "", cleaned)
    if not 9 <= len(digits) <= 15:
        raise ValueError("Enter a valid phone number")
    return "+" + digits


def mask_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone)
    if len(digits) < 6:
        return phone
    return f"+{digits[:3]} *** *** {digits[-3:]}"


def generate_opaque_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_otp(code: str, phone: str) -> str:
    return hmac.new(
        settings.secret_key.encode(), f"{phone}:{code}".encode(), hashlib.sha256
    ).hexdigest()


def verify_otp(code: str, phone: str, code_hash: str) -> bool:
    return hmac.compare_digest(hash_otp(code, phone), code_hash)


def utcnow() -> datetime:
    return datetime.now(UTC)


def create_signed_token(payload: dict[str, Any], salt: str = "generic") -> str:
    s = URLSafeTimedSerializer(settings.secret_key, salt=salt)
    return s.dumps(payload)


def read_signed_token(token: str, salt: str = "generic", max_age: int = 60 * 60 * 24 * 30) -> dict | None:
    s = URLSafeTimedSerializer(settings.secret_key, salt=salt)
    try:
        return s.loads(token, max_age=max_age)
    except (BadSignature, SignatureExpired):
        return None


def file_perceptual_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()[:32]


def expiry(days: int = 0, hours: int = 0, minutes: int = 0) -> datetime:
    return utcnow() + timedelta(days=days, hours=hours, minutes=minutes)
