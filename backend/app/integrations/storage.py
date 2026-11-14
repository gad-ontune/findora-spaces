from __future__ import annotations

import io
import logging
import uuid
from datetime import UTC, datetime
from pathlib import Path

from fastapi import UploadFile
from PIL import Image, ImageOps

from app.core.config import settings
from app.core.exceptions import ValidationError

logger = logging.getLogger("findora.media")

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/avif"}
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime"}
ALLOWED_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/avif": ".avif",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
}


def _upload_root() -> Path:
    root = Path(settings.upload_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


def _relative_path(filename: str) -> str:
    now = datetime.now(UTC)
    return str(Path("properties") / f"{now:%Y}" / f"{now:%m}" / filename)


def _media_url(relative: str) -> str:
    if settings.cdn_base_url:
        return f"{settings.cdn_base_url.rstrip('/')}/{relative}"
    return f"{settings.public_media_base.rstrip('/')}/{relative}"


def average_hash(image: Image.Image) -> str:
    small = image.convert("L").resize((8, 8), Image.Resampling.LANCZOS)
    pixels = list(small.getdata())
    avg = sum(pixels) / len(pixels)
    bits = "".join("1" if pixel > avg else "0" for pixel in pixels)
    return f"{int(bits, 2):016x}"


def save_image_upload(file: UploadFile, *, content: bytes) -> dict:
    try:
        image = Image.open(io.BytesIO(content))
        image = ImageOps.exif_transpose(image)
    except Exception as exc:
        raise ValidationError("The uploaded file is not a valid image.") from exc

    image.thumbnail((2400, 2400), Image.Resampling.LANCZOS)
    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")
    rel = _relative_path(f"{uuid.uuid4().hex}.webp")
    target = _upload_root() / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, "WEBP", quality=82, method=4)

    thumb = image.copy()
    thumb.thumbnail((640, 640), Image.Resampling.LANCZOS)
    thumb_rel = _relative_path(f"{uuid.uuid4().hex}_thumb.webp")
    thumb_target = _upload_root() / thumb_rel
    thumb_target.parent.mkdir(parents=True, exist_ok=True)
    thumb.save(thumb_target, "WEBP", quality=76, method=4)

    return {
        "storage_key": rel,
        "thumbnail_key": thumb_rel,
        "url": _media_url(rel),
        "thumbnail_url": _media_url(thumb_rel),
        "mime_type": "image/webp",
        "size_bytes": target.stat().st_size,
        "width": image.width,
        "height": image.height,
        "perceptual_hash": average_hash(image),
        "kind": "image",
    }


def save_video_upload(file: UploadFile, *, content: bytes) -> dict:
    suffix = ALLOWED_EXTENSIONS.get(file.content_type or "", ".mp4")
    rel = _relative_path(f"{uuid.uuid4().hex}{suffix}")
    target = _upload_root() / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
    return {
        "storage_key": rel,
        "url": _media_url(rel),
        "mime_type": file.content_type,
        "size_bytes": len(content),
        "kind": "video",
        "perceptual_hash": None,
        "width": None,
        "height": None,
    }


async def save_upload(file: UploadFile) -> dict:
    max_bytes = settings.max_upload_mb * 1024 * 1024
    content = await file.read()
    if not content:
        raise ValidationError("The uploaded file is empty.")
    if len(content) > max_bytes:
        raise ValidationError(
            f"Files must be smaller than {settings.max_upload_mb} MB.",
            details={"max_mb": settings.max_upload_mb},
        )
    content_type = file.content_type or ""
    if content_type in ALLOWED_IMAGE_TYPES:
        return save_image_upload(file, content=content)
    if content_type in ALLOWED_VIDEO_TYPES:
        return save_video_upload(file, content=content)
    raise ValidationError(
        "Unsupported file type. Upload JPG, PNG, WebP, AVIF, MP4, WebM or MOV files."
    )


def delete_local(storage_key: str | None) -> None:
    if not storage_key:
        return
    target = _upload_root() / storage_key
    try:
        target.unlink(missing_ok=True)
    except OSError:
        logger.warning("Could not delete media file %s", storage_key)
