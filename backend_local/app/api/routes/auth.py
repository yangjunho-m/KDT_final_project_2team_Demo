from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.security import create_access_token, decode_access_token
from app.db import get_db
from app.schemas.common import ApiResponse
from app.schemas.domain import LoginRequest
from app.services.auth_service import authenticate_user, get_user_by_username, to_user_schema

router = APIRouter()


@router.post("/login", response_model=ApiResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)) -> ApiResponse:
    user_account = authenticate_user(db, request.username, request.password)
    if user_account is None:
        raise AppError(
            code="INVALID_CREDENTIALS",
            message="아이디 또는 비밀번호가 올바르지 않습니다.",
            status_code=401,
        )

    user = to_user_schema(user_account)
    token = create_access_token(user.username)
    return ApiResponse(data={"user": user, **token, "redirectPath": "/operation"})


@router.get("/me", response_model=ApiResponse)
def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> ApiResponse:
    token = _extract_bearer_token(authorization)
    if token is None:
        raise AppError(
            code="AUTH_REQUIRED",
            message="로그인이 필요합니다.",
            status_code=401,
        )

    username = decode_access_token(token)
    if username is None:
        raise AppError(
            code="INVALID_TOKEN",
            message="인증 토큰이 유효하지 않습니다.",
            status_code=401,
        )

    user_account = get_user_by_username(db, username)
    if user_account is None:
        raise AppError(
            code="USER_NOT_FOUND",
            message="사용자를 찾을 수 없습니다.",
            status_code=404,
        )

    return ApiResponse(data=to_user_schema(user_account))


@router.post("/logout", response_model=ApiResponse)
def logout() -> ApiResponse:
    return ApiResponse(data={"revoked": True})


def _extract_bearer_token(authorization: str | None) -> str | None:
    if authorization is None:
        return None

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token
