from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.common import ApiResponse
from app.services.faiss_index_service import (
    ensure_default_faiss_index,
    get_faiss_status,
    list_faiss_indexes,
    search_similar_images,
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


@router.post("/search/image", response_model=ApiResponse)
async def search_by_image(
    file: UploadFile = File(...),
    top_k: int = Query(5, alias="topK", ge=1, le=50),
    db: Session = Depends(get_db),
) -> ApiResponse:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="이미지 파일만 검색할 수 있습니다.")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="빈 이미지 파일입니다.")
    try:
        items = search_similar_images(db, data, top_k)
    except (ValueError, RuntimeError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return ApiResponse(data={"items": items, "topK": top_k})
