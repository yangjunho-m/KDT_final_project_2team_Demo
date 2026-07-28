from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.common import ApiResponse
from app.services.faiss_index_service import (
    ensure_default_faiss_index,
    get_faiss_status,
    list_faiss_indexes,
)

router = APIRouter()


@router.get("/status", response_model=ApiResponse)
def get_status(db: Session = Depends(get_db)) -> ApiResponse:
    return ApiResponse(data=get_faiss_status(db))


@router.get("/indexes", response_model=ApiResponse)
def get_indexes(db: Session = Depends(get_db)) -> ApiResponse:
    return ApiResponse(data={"items": list_faiss_indexes(db)})


@router.post("/bootstrap", response_model=ApiResponse)
def bootstrap_index(db: Session = Depends(get_db)) -> ApiResponse:
    index = ensure_default_faiss_index(db)
    return ApiResponse(
        data={
            "id": index.id,
            "indexName": index.index_name,
            "status": index.status,
            "indexFilePath": index.index_file_path,
        },
        message="FAISS index metadata is ready.",
    )
