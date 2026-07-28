from datetime import UTC, datetime
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}


def build_error_response(
    code: str,
    message: str,
    details: dict[str, Any] | list[Any] | None = None,
) -> dict[str, Any]:
    return {
        "success": False,
        "error": {
            "code": code,
            "message": message,
            "details": details or {},
            "timestamp": datetime.now(UTC).isoformat(),
        },
    }


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(_: Request, error: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=error.status_code,
            content=build_error_response(error.code, error.message, error.details),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        _: Request,
        error: RequestValidationError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=build_error_response(
                "VALIDATION_ERROR",
                "요청 값이 올바르지 않습니다.",
                error.errors(),
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(
        _: Request,
        error: StarletteHTTPException,
    ) -> JSONResponse:
        message = str(error.detail) if error.detail else "요청을 처리할 수 없습니다."
        return JSONResponse(
            status_code=error.status_code,
            content=build_error_response("HTTP_ERROR", message),
        )
