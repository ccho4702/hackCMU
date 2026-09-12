from __future__ import annotations

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.app.schemas.errors import APIErrorBody, APIErrorResponse, ErrorCode


class AppError(Exception):
    def __init__(
        self,
        code: ErrorCode | str,
        message: str,
        status_code: int = 400,
        details: dict | None = None,
    ):
        self.code = code.value if isinstance(code, ErrorCode) else code
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        super().__init__(message)


def error_payload(code: str, message: str, details: dict | None = None) -> dict:
    body = APIErrorResponse(
        error=APIErrorBody(code=code, message=message, details=details or {})
    )
    return body.model_dump(by_alias=True)


async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=error_payload(exc.code, exc.message, exc.details),
    )


async def http_exception_handler(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = ErrorCode.ANALYSIS_FAILED.value
    if exc.status_code == 404:
        code = ErrorCode.ANALYSIS_NOT_FOUND.value
    message = exc.detail if isinstance(exc.detail, str) else "Request failed"
    return JSONResponse(
        status_code=exc.status_code,
        content=error_payload(code, message),
    )


async def validation_exception_handler(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content=error_payload(
            ErrorCode.INVALID_CONFIG.value,
            "Request validation failed.",
            {"errors": jsonable_encoder(exc.errors(), custom_encoder={ValueError: str})},
        ),
    )


async def unhandled_exception_handler(_request: Request, _exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content=error_payload(
            ErrorCode.ANALYSIS_FAILED.value,
            "An unexpected error occurred while processing the request.",
        ),
    )
