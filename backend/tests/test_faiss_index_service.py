from pathlib import Path

import pytest

from app.services.faiss_index_service import _read_metadata


def test_read_metadata_uses_only_existing_images(tmp_path: Path) -> None:
    (tmp_path / "one.png").write_bytes(b"png")
    (tmp_path / "meta.csv").write_text(
        ",file,lat,lng\n0,one.png,37.56,126.92\n1,missing.png,0,0\n",
        encoding="utf-8",
    )

    rows = _read_metadata(tmp_path)

    assert rows == [{
        "path": tmp_path / "one.png",
        "file": "one.png",
        "lat": 37.56,
        "lng": 126.92,
    }]


def test_read_metadata_requires_csv(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="meta.csv"):
        _read_metadata(tmp_path)
