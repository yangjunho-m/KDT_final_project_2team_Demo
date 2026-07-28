from fastapi import APIRouter, Query

from app.core.errors import AppError
from app.schemas.common import ApiResponse
from app.services.mock_data import page, sample_saved_coordinates

router = APIRouter()


@router.get("", response_model=ApiResponse)
def list_saved_coordinates(
    page_number: int = Query(default=1, alias="page", ge=1),
    size: int = Query(default=20, ge=1, le=100),
) -> ApiResponse:
    return ApiResponse(data=page(sample_saved_coordinates(), page_number, size))


@router.get("/{coordinate_id}", response_model=ApiResponse)
def get_saved_coordinate(coordinate_id: str) -> ApiResponse:
    for coordinate in sample_saved_coordinates():
        if coordinate.id == coordinate_id:
            return ApiResponse(data=coordinate)
    raise AppError("SAVED_COORDINATE_NOT_FOUND", "저장 좌표를 찾을 수 없습니다.", status_code=404)
