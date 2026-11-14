from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.permissions import DEFAULT_PERMISSIONS, ROLE_DEFINITIONS
from app.models import Permission, Role, SystemSetting
from app.core.security import utcnow
from app.services.subscription_service import ensure_default_plans


def ensure_rbac(db: Session) -> None:
    """Create or refresh permissions and role definitions without clobbering custom roles."""
    permissions: dict[str, Permission] = {
        p.code: p for p in db.execute(select(Permission)).scalars().all()
    }
    for code, description in DEFAULT_PERMISSIONS.items():
        permission = permissions.get(code)
        if permission is None:
            permission = Permission(code=code, description=description)
            db.add(permission)
            permissions[code] = permission
        elif permission.description != description:
            permission.description = description
    db.flush()

    existing_roles: dict[str, Role] = {
        r.code: r for r in db.execute(select(Role)).scalars().all()
    }
    for code, (name, description, permission_codes) in ROLE_DEFINITIONS.items():
        role = existing_roles.get(code)
        if role is None:
            role = Role(code=code, name=name, description=description)
            db.add(role)
            existing_roles[code] = role
        else:
            role.name = name
            role.description = description
        role.permissions = [
            permissions[pcode] for pcode in permission_codes if pcode in permissions
        ]
    db.commit()


DEFAULT_SETTINGS = {
    "availability.freshness_days": (
        {"default": 14, "residential": 14, "commercial": 21},
        "Availability confirmation freshness window by category",
    ),
    "service.assisted_search_fee": (300, "Assisted search service fee in KES"),
    "service.featured_listing_fee": (200, "Featured listing fee in KES, per promotion"),
    "platform.assisted_search_enabled": (True, "Whether assisted search requests are accepted"),
    "platform.contact_reveal_requires_enquiry": (True, "Mask direct phone numbers until an enquiry is made"),
    "notifications.sms_enabled": (True, "Send transactional SMS in production"),
    "availability.reminder_days": (3, "Days before freshness expiry to remind landlords"),
}


def ensure_settings(db: Session) -> None:
    existing = {
        s.key: s for s in db.execute(select(SystemSetting)).scalars().all()
    }
    for key, (value, description) in DEFAULT_SETTINGS.items():
        if key not in existing:
            db.add(
                SystemSetting(
                    key=key,
                    value=json.dumps(value),
                    description=description,
                )
            )
    db.commit()


def get_setting(db: Session, key: str, default=None):
    setting = db.execute(
        select(SystemSetting).where(SystemSetting.key == key)
    ).scalar_one_or_none()
    if setting is None:
        return default
    try:
        return json.loads(setting.value)
    except (TypeError, ValueError):
        return default


def bootstrap(db: Session) -> None:
    ensure_rbac(db)
    ensure_settings(db)
    ensure_default_plans(db)
    db.commit()
