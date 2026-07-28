from fastapi import APIRouter
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.common import ApiResponse
from app.services.e2e_fixture_service import get_e2e_test_fixture_info
from app.services.health_service import get_system_health_status
from fastapi import Depends

router = APIRouter()


@router.get("/health", response_model=ApiResponse)
def get_system_health() -> ApiResponse:
    return ApiResponse(data=get_system_health_status())


@router.get("/e2e-fixture", response_model=ApiResponse)
def get_e2e_fixture(db: Session = Depends(get_db)) -> ApiResponse:
    return ApiResponse(data=get_e2e_test_fixture_info(db))
