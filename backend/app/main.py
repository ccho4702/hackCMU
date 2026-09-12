from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

os.environ.setdefault("MPLCONFIGDIR", "/tmp/mpl-mellonaires")

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.app.api.errors import (
    AppError,
    app_error_handler,
    http_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from backend.app.api.routes import analysis, health, live
from backend.app.core.config import get_settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
    settings.temp_storage_path.mkdir(parents=True, exist_ok=True)
    from backend import db
    if db.configured():
        try:
            db.ensure_indexes()
        except Exception:
            logging.getLogger(__name__).warning("MongoDB unavailable; local coaching remains enabled")
    try:
        yield
    finally:
        if db.client.cache_info().currsize:
            db.client().close()
            db.client.cache_clear()


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
    from backend.api import api as coaching_api
    application.include_router(coaching_api)
    from backend.routers import auth, references, trials, storage
    from pymongo.errors import PyMongoError
    from fastapi.responses import JSONResponse

    async def mongo_error_handler(request, exc):
        return JSONResponse(status_code=503, content={"detail": "MongoDB is unavailable. Check server database configuration."})

    application.add_exception_handler(PyMongoError, mongo_error_handler)
    for router in (auth.router, references.router, trials.router, storage.router):
        application.include_router(router)
    return application


app = create_app()
