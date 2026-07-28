from fastapi import APIRouter

from app.api.routes import (
    auth,
    dashboard,
    drones,
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

api_router = APIRouter()
api_router.include_router(health.router, prefix="/system", tags=["system"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(operation_areas.router, prefix="/operation-areas", tags=["operation-areas"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(scenario_runs.router, prefix="/scenario-runs", tags=["scenario-runs"])
api_router.include_router(
    scenario_templates.router,
    prefix="/scenario-templates",
    tags=["scenario-templates"],
)
api_router.include_router(saved_coordinates.router, prefix="/saved-coordinates", tags=["saved-coordinates"])
api_router.include_router(drones.router, prefix="/drones", tags=["drones"])
api_router.include_router(monitoring.router, prefix="/operation", tags=["operation"])
api_router.include_router(scenarios.router, prefix="/scenarios", tags=["scenarios"])
api_router.include_router(inference.router, prefix="/inference", tags=["inference"])
api_router.include_router(targets.router, prefix="/targets", tags=["targets"])
