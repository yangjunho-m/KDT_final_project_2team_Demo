"""이 모듈의 역할을 설명합니다."""

import sys
from pathlib import Path

AI_SERVER_PATH = Path(__file__).resolve().parents[1] / "ai-server"
sys.path.insert(0, str(AI_SERVER_PATH))

from app.schemas.video_search import IndexedItem
from app.services.providers import DummyEmbeddingProvider
from app.services.vector_store import JsonVectorStore


def test_dummy_embedding_is_stable() -> None:
    """test_dummy_embedding_is_stable 테스트의 검증 목적을 설명합니다."""

    provider = DummyEmbeddingProvider(dim=16)

    assert provider.embed_text("red car") == provider.embed_text("red car")


def test_vector_store_returns_similar_item(tmp_path: Path) -> None:
    """test_vector_store_returns_similar_item 테스트의 검증 목적을 설명합니다."""

    provider = DummyEmbeddingProvider(dim=32)
    store = JsonVectorStore(str(tmp_path / "vectors.json"))
    item = IndexedItem(
        item_id="video1:scene:0",
        video_id="video1",
        timestamp_seconds=0.0,
        item_type="scene",
        text="red car on road",
    )

    store.add_many([item], [provider.embed_text(item.text)])
    results = store.search(provider.embed_text("red car"), top_k=1)

    assert len(results) == 1
    assert results[0].item.item_id == item.item_id
    assert results[0].score > 0
