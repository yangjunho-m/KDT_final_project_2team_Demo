from datetime import datetime, timezone

UTC = timezone.utc
from typing import Any

from pydantic import BaseModel, Field


class Position(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    altitude: float | None = None


class ApiResponse(BaseModel):
    success: bool = True
    data: Any = None
    message: str = "요청이 성공했습니다."


class PageMeta(BaseModel):
    page: int = 1
    size: int = 20
    total: int = 0


class RealtimeEvent(BaseModel):
    eventId: str
    sequence: int
    eventType: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    payload: dict[str, Any]
