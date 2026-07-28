import csv
import json
import os
import sys
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import (DroneImageRecord, FaissVectorIndexRecord,
                           GeoSearchRequestRecord, ImageEmbeddingRecord,
                           SatelliteImageRecord)
from app.services.storage_service import upload_satellite_image

DEFAULT_INDEX_ID = "FIDX-DEMO-001"


def _dependencies():
    try:
        import faiss
        import numpy as np
        import torch
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError("FAISS 이미지 기능 의존성을 설치하세요: pip install -r requirements.txt") from exc
    return faiss, np, torch, Image


class ImageEmbedder:
    def __init__(self) -> None:
        _, _, torch, _ = _dependencies()
        settings = get_settings()
        source_dir = Path(settings.gameloc_source_dir).expanduser().resolve()
        checkpoint = Path(settings.gameloc_checkpoint_path).expanduser().resolve()
        if not source_dir.is_dir():
            raise RuntimeError(
                f"Game4Loc 소스가 없습니다: {source_dir} (GTA-UAV/Game4Loc 경로를 GAMELOC_SOURCE_DIR에 지정하세요)"
            )
        if not checkpoint.is_file():
            raise RuntimeError(
                f"Game4Loc 체크포인트가 없습니다: {checkpoint} (GAMELOC_CHECKPOINT_PATH를 지정하세요)"
            )
        if str(source_dir) not in sys.path:
            sys.path.insert(0, str(source_dir))
        try:
            from game4loc.models.model import DesModel
        except ImportError as exc:
            raise RuntimeError(f"Game4Loc 모듈을 불러올 수 없습니다: {source_dir}") from exc
        self.torch = torch
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.image_size = settings.gameloc_image_size
        self.model = DesModel(
            model_name=settings.faiss_embedding_model,
            pretrained=False,
            img_size=self.image_size,
            share_weights=True,
        )
        config = self.model.get_config()
        self.mean = torch.tensor(config["mean"], dtype=torch.float32).view(3, 1, 1)
        self.std = torch.tensor(config["std"], dtype=torch.float32).view(3, 1, 1)
        state = torch.load(checkpoint, map_location="cpu", weights_only=True)
        if isinstance(state, dict) and "state_dict" in state:
            state = state["state_dict"]
        self.model.load_state_dict(state, strict=False)
        self.model = self.model.to(self.device).eval()

    def encode(self, image_bytes: list[bytes]):
        _, np, torch, Image = _dependencies()
        tensors = []
        for data in image_bytes:
            image = Image.open(BytesIO(data)).convert("RGB").resize(
                (self.image_size, self.image_size), Image.Resampling.BILINEAR
            )
            array = np.asarray(image, dtype="float32") / 255.0
            tensor = torch.from_numpy(array).permute(2, 0, 1)
            tensors.append((tensor - self.mean) / self.std)
        inputs = torch.stack(tensors).to(self.device)
        with torch.inference_mode():
            vectors = torch.nn.functional.normalize(self.model(inputs), dim=-1)
        return vectors.float().cpu().numpy().astype("float32")


def ensure_default_faiss_index(db: Session) -> FaissVectorIndexRecord:
    settings = get_settings()
    index_dir = Path(settings.faiss_index_dir)
    index_dir.mkdir(parents=True, exist_ok=True)
    index_path = index_dir / f"{settings.faiss_default_index_name}.faiss"
    metadata_path = index_dir / f"{settings.faiss_default_index_name}.json"
    record = db.get(FaissVectorIndexRecord, DEFAULT_INDEX_ID)
    values = dict(index_name=settings.faiss_default_index_name, index_type="IndexIDMap2(IndexFlatIP)",
                  embedding_model=settings.faiss_embedding_model, embedding_dimension=settings.faiss_embedding_dimension,
                  metric_type=settings.faiss_metric_type, index_file_path=index_path.as_posix(),
                  metadata_file_path=metadata_path.as_posix())
    if record is None:
        record = FaissVectorIndexRecord(id=DEFAULT_INDEX_ID, status="EMPTY", vector_count=0, **values)
        db.add(record)
    else:
        for key, value in values.items():
            setattr(record, key, value)
        if record.status == "READY" and (
            not index_path.exists() or index_path.stat().st_size == 0
        ):
            record.status = "EMPTY"
            record.vector_count = 0
    db.commit()
    db.refresh(record)
    return record


def batch_index_satellite_directory(db: Session, source_dir: Path, batch_size: int = 16) -> dict:
    faiss, np, _, _ = _dependencies()
    settings = get_settings()
    record = ensure_default_faiss_index(db)
    rows = _read_metadata(source_dir)
    if not rows:
        raise ValueError(f"인덱싱할 이미지가 없습니다: {source_dir}")
    record.status = "BUILDING"
    db.commit()
    embedder = ImageEmbedder()
    index = faiss.IndexIDMap2(faiss.IndexFlatIP(settings.faiss_embedding_dimension))
    metadata = []
    try:
        db.execute(delete(ImageEmbeddingRecord).where(ImageEmbeddingRecord.index_id == record.id))
        for offset in range(0, len(rows), batch_size):
            batch = rows[offset:offset + batch_size]
            payloads = [item["path"].read_bytes() for item in batch]
            vectors = embedder.encode(payloads)
            if vectors.shape[1] != settings.faiss_embedding_dimension:
                raise ValueError(f"모델 차원({vectors.shape[1]})과 설정({settings.faiss_embedding_dimension})이 다릅니다")
            ids = np.arange(offset, offset + len(batch), dtype="int64")
            index.add_with_ids(vectors, ids)
            for vector_id, item, data in zip(ids.tolist(), batch, payloads):
                object_key = f"{settings.faiss_satellite_prefix}/{item['file']}"
                upload_satellite_image(object_key, data, "image/png")
                satellite = db.scalar(select(SatelliteImageRecord).where(SatelliteImageRecord.object_key == object_key))
                if satellite is None:
                    satellite = SatelliteImageRecord(id=f"SAT-{uuid4().hex}", object_key=object_key)
                    db.add(satellite)
                satellite.file_name, satellite.latitude, satellite.longitude = item["file"], item["lat"], item["lng"]
                satellite.source = "yeonnam-batch"
                embedding = ImageEmbeddingRecord(id=f"EMB-{uuid4().hex}", index_id=record.id,
                    image_type="SATELLITE", image_id=satellite.id, object_key=object_key,
                    faiss_vector_id=vector_id, embedding_dimension=vectors.shape[1], embedding_model=settings.faiss_embedding_model)
                db.add(embedding)
                metadata.append({"faissId": vector_id, "imageId": satellite.id, "name": item["file"],
                                 "objectKey": object_key, "latitude": item["lat"], "longitude": item["lng"]})
            db.flush()
        _atomic_write_index(faiss, index, Path(record.index_file_path))
        _atomic_write_json(metadata, Path(record.metadata_file_path))
        record.vector_count, record.status, record.updated_at = index.ntotal, "READY", datetime.now(UTC)
        db.commit()
        return {"indexId": record.id, "vectorCount": index.ntotal, "sourceDirectory": str(source_dir), "status": record.status}
    except Exception:
        db.rollback()
        record = db.get(FaissVectorIndexRecord, DEFAULT_INDEX_ID)
        record.status = "FAILED"
        db.commit()
        raise


def search_similar_images(db: Session, image_data: bytes, top_k: int = 5) -> list[dict]:
    faiss, np, _, _ = _dependencies()
    record = ensure_default_faiss_index(db)
    path = Path(record.index_file_path)
    if record.status != "READY" or not path.exists() or path.stat().st_size == 0:
        raise ValueError("먼저 위성 이미지 배치 인덱싱을 실행하세요")
    index = faiss.read_index(str(path))
    vector = ImageEmbedder().encode([image_data])
    scores, ids = index.search(vector, min(top_k, index.ntotal))
    found_ids = [int(value) for value in ids[0] if value >= 0]
    embeddings = db.scalars(select(ImageEmbeddingRecord).where(
        ImageEmbeddingRecord.index_id == record.id, ImageEmbeddingRecord.faiss_vector_id.in_(found_ids))).all()
    by_id = {item.faiss_vector_id: item for item in embeddings}
    satellites = {item.id: item for item in db.scalars(select(SatelliteImageRecord).where(
        SatelliteImageRecord.id.in_([item.image_id for item in embeddings]))).all()}
    results = []
    for score, vector_id in zip(scores[0].tolist(), ids[0].tolist()):
        embedding = by_id.get(int(vector_id))
        if not embedding: continue
        satellite = satellites.get(embedding.image_id)
        results.append({"faissId": int(vector_id), "score": float(score), "imageId": satellite.id,
                        "name": satellite.file_name, "objectKey": satellite.object_key,
                        "latitude": satellite.latitude, "longitude": satellite.longitude})
    return results


def _read_metadata(source_dir: Path) -> list[dict]:
    csv_path = source_dir / "meta.csv"
    if not csv_path.is_file(): raise ValueError(f"meta.csv가 없습니다: {csv_path}")
    rows = []
    with csv_path.open(encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            path = source_dir / row["file"]
            if path.is_file(): rows.append({"path": path, "file": row["file"], "lat": float(row["lat"]), "lng": float(row["lng"])})
    return rows


def _atomic_write_index(faiss, index, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True); temp = path.with_suffix(".tmp")
    faiss.write_index(index, str(temp)); os.replace(temp, path)


def _atomic_write_json(data: list[dict], path: Path) -> None:
    temp = path.with_suffix(".tmp"); temp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"); os.replace(temp, path)


def get_faiss_status(db: Session) -> dict[str, object]:
    index = ensure_default_faiss_index(db)
    return {"enabled": True, "status": index.status, "defaultIndex": _to_index_payload(index), "tables": {
        "faissVectorIndexes": _count(db, FaissVectorIndexRecord), "imageEmbeddings": _count(db, ImageEmbeddingRecord),
        "droneImages": _count(db, DroneImageRecord), "satelliteImages": _count(db, SatelliteImageRecord),
        "geoSearchRequests": _count(db, GeoSearchRequestRecord)}}


def list_faiss_indexes(db: Session) -> list[dict[str, object]]:
    ensure_default_faiss_index(db)
    return [_to_index_payload(item) for item in db.scalars(select(FaissVectorIndexRecord).order_by(FaissVectorIndexRecord.created_at.desc())).all()]


def _count(db: Session, model) -> int: return int(db.scalar(select(func.count()).select_from(model)) or 0)
def _to_index_payload(r) -> dict: return {"id": r.id, "indexName": r.index_name, "indexType": r.index_type,
    "embeddingModel": r.embedding_model, "embeddingDimension": r.embedding_dimension, "metricType": r.metric_type,
    "indexFilePath": r.index_file_path, "metadataFilePath": r.metadata_file_path, "status": r.status,
    "vectorCount": r.vector_count, "createdAt": r.created_at, "updatedAt": r.updated_at}
