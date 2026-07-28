"""이 모듈의 역할을 설명합니다."""

from pydantic import BaseModel, Field


class BoundingBox(BaseModel):
    """BoundingBox 클래스의 역할을 설명합니다."""

    x1: int
    y1: int
    x2: int
    y2: int


class DetectedObject(BaseModel):
    """DetectedObject 클래스의 역할을 설명합니다."""

    label: str
    confidence: float = Field(ge=0.0, le=1.0)
    bbox: BoundingBox


class IndexedItem(BaseModel):
    """IndexedItem 클래스의 역할을 설명합니다."""

    item_id: str
    video_id: str
    timestamp_seconds: float
    item_type: str
    text: str
    frame_path: str | None = None
    crop_path: str | None = None
    object_label: str | None = None
    confidence: float | None = None
    bbox: BoundingBox | None = None


class IndexVideoResponse(BaseModel):
    """IndexVideoResponse 클래스의 역할을 설명합니다."""

    video_id: str
    indexed_count: int
    items: list[IndexedItem]


class SearchRequest(BaseModel):
    """SearchRequest 클래스의 역할을 설명합니다."""

    query: str = Field(min_length=1)
    top_k: int = Field(default=10, ge=1, le=50)
    item_type: str | None = None


class SearchResult(BaseModel):
    """SearchResult 클래스의 역할을 설명합니다."""

    score: float
    item: IndexedItem


class SearchResponse(BaseModel):
    """SearchResponse 클래스의 역할을 설명합니다."""

    query: str
    results: list[SearchResult]
