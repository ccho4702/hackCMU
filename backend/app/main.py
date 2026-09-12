from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

os.environ.setdefault("MPLCONFIGDIR", "/tmp/mpl-mellonaires")

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.errors import (
    AppError,
    app_error_handler,
    http_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from app.api.routes import analysis, health, live
from app.core.config import get_settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
    settings.temp_storage_path.mkdir(parents=True, exist_ok=True)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title="Mellonaires Presentation Analysis",
        description=(
            "Instrumentation API for quantitative analysis of observable facial "
            "delivery in presentation video. Not a psychological or emotion classifier."
        ),
        version=settings.backend_version,
        lifespan=lifespan,
    )
    origins = [origin.strip() for origin in settings.frontend_origin.split(",") if origin.strip()]
    application.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )
    application.add_exception_handler(AppError, app_error_handler)
    application.add_exception_handler(StarletteHTTPException, http_exception_handler)
    application.add_exception_handler(RequestValidationError, validation_exception_handler)
    application.add_exception_handler(Exception, unhandled_exception_handler)
    application.include_router(health.router, prefix="/api/v1", tags=["health"])
    application.include_router(analysis.router, prefix="/api/v1", tags=["analyses"])
    application.include_router(live.router, prefix="/api/v1", tags=["live"])
    return application


app = create_app()
