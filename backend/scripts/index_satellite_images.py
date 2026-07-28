import argparse
from pathlib import Path

from app.db import SessionLocal, init_database
from app.services.faiss_index_service import batch_index_satellite_directory


def main() -> None:
    parser = argparse.ArgumentParser(description="MinIO + FAISS 위성 이미지 배치 인덱싱")
    parser.add_argument("source", type=Path, help="meta.csv와 PNG 이미지가 있는 디렉터리")
    parser.add_argument("--batch-size", type=int, default=16)
    args = parser.parse_args()
    if args.batch_size < 1:
        parser.error("--batch-size는 1 이상이어야 합니다")
    source = args.source.expanduser().resolve()
    if not source.is_dir():
        parser.error(f"디렉터리가 없습니다: {source}")
    init_database()
    with SessionLocal() as db:
        result = batch_index_satellite_directory(db, source, args.batch_size)
    print(f"완료: {result['vectorCount']}개 벡터, 상태={result['status']}")


if __name__ == "__main__":
    main()
