from fastapi import APIRouter

from app.schemas.common import ApiResponse
from app.services.mock_data import sample_operation_snapshot

router = APIRouter()


@router.get("/snapshot", response_model=ApiResponse)
def get_operation_snapshot() -> ApiResponse:
    return ApiResponse(data=sample_operation_snapshot())
