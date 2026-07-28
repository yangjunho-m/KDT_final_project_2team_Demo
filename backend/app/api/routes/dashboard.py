from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.common import ApiResponse
from app.services.dashboard_service import get_main_dashboard_initial_data

router = APIRouter()


@router.get("/main", response_model=ApiResponse)
def get_main_dashboard(db: Session = Depends(get_db)) -> ApiResponse:
    return ApiResponse(data=get_main_dashboard_initial_data(db))
