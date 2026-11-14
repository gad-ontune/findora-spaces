from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLog, User


def write_audit(
    db: Session,
    *,
    actor: User | None,
    action: str,
    resource_type: str,
    resource_id: Any = None,
    before: Any = None,
    after: Any = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> AuditLog:
    def encode(value: Any) -> str | None:
        if value is None:
            return None
        try:
            return json.dumps(value, default=str)
        except (TypeError, ValueError):
            return json.dumps(str(value))

    log = AuditLog(
        actor_id=actor.id if actor else None,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id is not None else None,
        before=encode(before),
        after=encode(after),
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(log)
    return log
