from datetime import datetime, timezone

UTC = timezone.utc

import httpx
from sqlalchemy import text

from app.core.config import get_settings
from app.db.session import engine
from app.schemas.domain import SystemHealth
from app.schemas.enums import SystemStatus
from app.services.storage_service import check_required_buckets


def get_system_health_status() -> SystemHealth:
    return SystemHealth(
        api=SystemStatus.OK,
        database=_check_database(),
        storage=_check_storage(),
        inferenceAgent=_check_inference_agent(),
        checkedAt=datetime.now(UTC),
    )


def _check_database() -> SystemStatus:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception:
        return SystemStatus.DEGRADED
    return SystemStatus.OK


def _check_storage() -> SystemStatus:
    try:
        check_required_buckets()
    except Exception:
        return SystemStatus.DEGRADED
    return SystemStatus.OK


def _check_inference_agent() -> SystemStatus:
    settings = get_settings()
    try:
        response = httpx.get(settings.local_inference_agent_url, timeout=1.0)
    except Exception:
        return SystemStatus.DEGRADED

    if response.status_code >= 500:
        return SystemStatus.DEGRADED
    return SystemStatus.OK
