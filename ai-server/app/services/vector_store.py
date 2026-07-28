"""이 모듈의 역할을 설명합니다."""

from __future__ import annotations

import json
import math
from pathlib import Path

from app.schemas.video_search import IndexedItem, SearchResult


class JsonVectorStore:
    """JSON 파일 기반 벡터 저장소입니다."""

    def __init__(self, store_path: str) -> None:
        """__init__ 함수의 역할을 설명합니다."""

        self.store_path = Path(store_path)
        self.records: list[dict] = []
        self._load()

    def add_many(self, items: list[IndexedItem], embeddings: list[list[float]]) -> None:
        """add_many 함수의 역할을 설명합니다."""

        if len(items) != len(embeddings):
            raise ValueError("items and embeddings must have the same length.")

        existing_ids = {record["item"]["item_id"] for record in self.records}
        for item, embedding in zip(items, embeddings, strict=True):
            if item.item_id in existing_ids:
                continue
            self.records.append({"item": dump_model(item), "embedding": embedding})

        self._save()

    def search(self, query_embedding: list[float], top_k: int, item_type: str | None = None) -> list[SearchResult]:
        """search 함수의 역할을 설명합니다."""

        scored: list[SearchResult] = []
        for record in self.records:
            item = load_indexed_item(record["item"])
            if item_type and item.item_type != item_type:
                continue
            score = cosine_similarity(query_embedding, record["embedding"])
            scored.append(SearchResult(score=score, item=item))

        return sorted(scored, key=lambda result: result.score, reverse=True)[:top_k]

    def _load(self) -> None:
        """_load 함수의 역할을 설명합니다."""

        if not self.store_path.exists():
            return
        with self.store_path.open("r", encoding="utf-8") as file:
            self.records = json.load(file)

    def _save(self) -> None:
        """_save 함수의 역할을 설명합니다."""

        self.store_path.parent.mkdir(parents=True, exist_ok=True)
        with self.store_path.open("w", encoding="utf-8") as file:
            json.dump(self.records, file, ensure_ascii=False, indent=2)


def cosine_similarity(left: list[float], right: list[float]) -> float:
    """cosine_similarity 함수의 역할을 설명합니다."""

    if len(left) != len(right):
        return 0.0
    dot = sum(a * b for a, b in zip(left, right, strict=True))
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return dot / (left_norm * right_norm)


def dump_model(model) -> dict:
    """dump_model 함수의 역할을 설명합니다."""

    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()


def load_indexed_item(data: dict) -> IndexedItem:
    """load_indexed_item 함수의 역할을 설명합니다."""

    if hasattr(IndexedItem, "model_validate"):
        return IndexedItem.model_validate(data)
    return IndexedItem.parse_obj(data)
