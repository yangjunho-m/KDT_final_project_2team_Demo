from datetime import datetime, timezone

UTC = timezone.utc
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import (
    DroneImageRecord,
    FaissVectorIndexRecord,
    GeoSearchRequestRecord,
    ImageEmbeddingRecord,
    SatelliteImageRecord,
)

DEFAULT_INDEX_ID = "FIDX-DEMO-001"


def ensure_default_faiss_index(db: Session) -> FaissVectorIndexRecord:
    settings = get_settings()
    index_dir = Path(settings.faiss_index_dir)
    index_dir.mkdir(parents=True, exist_ok=True)

    index_file_path = index_dir / f"{settings.faiss_default_index_name}.faiss"
    metadata_file_path = index_dir / f"{settings.faiss_default_index_name}.json"
    index_file_path.touch(exist_ok=True)
    metadata_file_path.touch(exist_ok=True)

    record = db.get(FaissVectorIndexRecord, DEFAULT_INDEX_ID)
    if record is None:
        record = FaissVectorIndexRecord(
            id=DEFAULT_INDEX_ID,
            index_name=settings.faiss_default_index_name,
            index_type="IndexFlatL2",
            embedding_model=settings.faiss_embedding_model,
            embedding_dimension=settings.faiss_embedding_dimension,
            metric_type=settings.faiss_metric_type,
            index_file_path=str(index_file_path.as_posix()),
            metadata_file_path=str(metadata_file_path.as_posix()),
            status="READY",
            vector_count=0,
        )
        db.add(record)
    else:
        record.index_name = settings.faiss_default_index_name
        record.embedding_model = settings.faiss_embedding_model
        record.embedding_dimension = settings.faiss_embedding_dimension
        record.metric_type = settings.faiss_metric_type
        record.index_file_path = str(index_file_path.as_posix())
        record.metadata_file_path = str(metadata_file_path.as_posix())
        record.status = "READY"
        record.updated_at = datetime.now(UTC)

    db.commit()
    db.refresh(record)
    return record


def get_faiss_status(db: Session) -> dict[str, object]:
    index = ensure_default_faiss_index(db)
    return {
        "enabled": True,
        "status": index.status,
        "defaultIndex": _to_index_payload(index),
        "tables": {
            "faissVectorIndexes": _count(db, FaissVectorIndexRecord),
            "imageEmbeddings": _count(db, ImageEmbeddingRecord),
            "droneImages": _count(db, DroneImageRecord),
            "satelliteImages": _count(db, SatelliteImageRecord),
            "geoSearchRequests": _count(db, GeoSearchRequestRecord),
        },
        "note": "FAISS metadata/index registry is prepared. Vector search can be connected later.",
    }


def list_faiss_indexes(db: Session) -> list[dict[str, object]]:
    ensure_default_faiss_index(db)
    records = db.scalars(
        select(FaissVectorIndexRecord).order_by(FaissVectorIndexRecord.created_at.desc())
    ).all()
    return [_to_index_payload(record) for record in records]


def _count(db: Session, model: type[object]) -> int:
    return int(db.scalar(select(func.count()).select_from(model)) or 0)


def _to_index_payload(record: FaissVectorIndexRecord) -> dict[str, object]:
    return {
        "id": record.id,
        "indexName": record.index_name,
        "indexType": record.index_type,
        "embeddingModel": record.embedding_model,
        "embeddingDimension": record.embedding_dimension,
        "metricType": record.metric_type,
        "indexFilePath": record.index_file_path,
        "metadataFilePath": record.metadata_file_path,
        "status": record.status,
        "vectorCount": record.vector_count,
        "createdAt": record.created_at,
        "updatedAt": record.updated_at,
    }
