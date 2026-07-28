from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    auth,
    dashboard,
    drone_view,
    drones,
    faiss,
    health,
    inference,
    monitoring,
    operation_areas,
    reports,
    saved_coordinates,
    scenario_runs,
    scenario_templates,
    scenarios,
    targets,
)
from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.db import SessionLocal, init_database
from app.services.auth_service import seed_demo_admin
from app.services.drone_view_dataset_seed_service import seed_drone_view_dataset
from app.services.e2e_fixture_service import seed_e2e_test_fixture
from app.services.faiss_index_service import ensure_default_faiss_index
from app.services.operation_area_service import seed_demo_operation_area
from app.services.report_service import seed_demo_reports
from app.workers.scenario_tick_scheduler import ScenarioTickScheduler
from app.websocket.router import router as websocket_router

settings = get_settings()
scenario_tick_scheduler = ScenarioTickScheduler(
    interval_seconds=settings.scenario_tick_interval_seconds,
)

tags_metadata = [
    {"name": "scenario-templates", "description": "시나리오 템플릿 저장 / 조회 / 수정 / 삭제"},
    {"name": "auth", "description": "로그인 / 인증"},
    {"name": "dashboard", "description": "로그인 이후 초기화면"},
    {"name": "operation-areas", "description": "적진지 생성 / 조회 / 수정 / 삭제 / snapshot"},
    {"name": "drones", "description": "드론 등록 / 조회 / 이동 좌표 / 이미지 업로드"},
    {"name": "targets", "description": "표적 생성 / 조회 / 수정 / 삭제"},
    {"name": "reports", "description": "상황 보고 생성 / 조회 / 상태 변경 / 첨부"},
    {"name": "scenario-runs", "description": "적진지 단위 시나리오 실행 / 중지 / 활성 조회"},
    {"name": "scenarios", "description": "시나리오 적용 / 종료"},
    {"name": "inference", "description": "AI 추론 작업"},
    {"name": "system", "description": "서버 상태 확인"},
    {"name": "saved-coordinates", "description": "기존 저장 좌표 호환 API"},
    {"name": "operation", "description": "기존 모니터링 호환 API"},
]


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_database()
    with SessionLocal() as db:
        if settings.seed_admin:
            seed_demo_admin(db)
        if settings.seed_demo_data:
            seed_demo_operation_area(db)
            seed_demo_reports(db)
        if settings.seed_e2e_fixture:
            seed_e2e_test_fixture(db)
        if settings.seed_drone_view_dataset:
            seed_drone_view_dataset(db)
        ensure_default_faiss_index(db)
    if settings.scenario_tick_scheduler_enabled:
        scenario_tick_scheduler.start()
    yield
    if settings.scenario_tick_scheduler_enabled:
        await scenario_tick_scheduler.stop()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="드론 플랫폼 V2 시연용 백엔드 서버",
    lifespan=lifespan,
    openapi_tags=tags_metadata,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

app.include_router(auth.router, prefix=f"{settings.api_prefix}/auth", tags=["auth"])
app.include_router(dashboard.router, prefix=f"{settings.api_prefix}/dashboard", tags=["dashboard"])
app.include_router(drone_view.router, prefix=f"{settings.api_prefix}/drone-view", tags=["drone-view"])
app.include_router(operation_areas.router, prefix=f"{settings.api_prefix}/operation-areas", tags=["operation-areas"])
app.include_router(drones.router, prefix=f"{settings.api_prefix}/drones", tags=["drones"])
app.include_router(targets.router, prefix=f"{settings.api_prefix}/targets", tags=["targets"])
app.include_router(reports.router, prefix=f"{settings.api_prefix}/reports", tags=["reports"])
app.include_router(
    scenario_runs.router,
    prefix=f"{settings.api_prefix}/scenario-runs",
    tags=["scenario-runs"],
)
app.include_router(
    scenario_templates.router,
    prefix=f"{settings.api_prefix}/scenario-templates",
    tags=["scenario-templates"],
)
app.include_router(scenarios.router, prefix=f"{settings.api_prefix}/scenarios", tags=["scenarios"])
app.include_router(inference.router, prefix=f"{settings.api_prefix}/inference", tags=["inference"])
app.include_router(faiss.router, prefix=f"{settings.api_prefix}/faiss", tags=["faiss"])
app.include_router(health.router, prefix=f"{settings.api_prefix}/system", tags=["system"])
app.include_router(
    saved_coordinates.router,
    prefix=f"{settings.api_prefix}/saved-coordinates",
    tags=["saved-coordinates"],
)
app.include_router(monitoring.router, prefix=f"{settings.api_prefix}/operation", tags=["operation"])
app.include_router(websocket_router)


@app.get("/")
def root() -> dict[str, str]:
    return {
        "service": settings.app_name,
        "status": "ok",
        "docs": "/docs",
        "health": f"{settings.api_prefix}/system/health",
    }
