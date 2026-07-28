from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.common import ApiResponse, Position
from app.services.drone_view_dataset_seed_service import (
    DATASET_DEMO_TEMPLATE_ID,
    seed_drone_view_dataset,
)
from app.services.scenario_template_service import (
    create_scenario_template,
    delete_scenario_template,
    get_scenario_template_record,
    list_scenario_templates,
    to_scenario_template_schema,
    update_scenario_template,
)

router = APIRouter()


class InterferenceZoneTemplate(BaseModel):
    center: Position
    radiusMeters: float = Field(ge=50, le=5000)


class ScenarioTemplateCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=1000)
    scenarioType: str = Field(pattern="^(NORMAL|JAMMING|SPOOFING)$")
    config: dict[str, object]
    interferenceZone: InterferenceZoneTemplate
    createdBy: str = Field(default="admin", min_length=1, max_length=50)


class ScenarioTemplateUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=1000)
    scenarioType: str | None = Field(default=None, pattern="^(NORMAL|JAMMING|SPOOFING)$")
    config: dict[str, object] | None = None
    interferenceZone: InterferenceZoneTemplate | None = None


@router.post("", response_model=ApiResponse, status_code=201)
def create_template(
    request: ScenarioTemplateCreateRequest,
    db: Session = Depends(get_db),
) -> ApiResponse:
    template = create_scenario_template(
        db,
        name=request.name,
        description=request.description,
        scenario_type=request.scenarioType,
        config=request.config,
        interference_zone=request.interferenceZone.model_dump(),
        created_by=request.createdBy,
    )
    return ApiResponse(data=template, message="시나리오 템플릿이 저장되었습니다.")


@router.get("", response_model=ApiResponse)
def list_templates(
    scenario_type: str | None = Query(default=None, alias="scenarioType"),
    db: Session = Depends(get_db),
) -> ApiResponse:
    return ApiResponse(
        data={"items": list_scenario_templates(db, scenario_type=scenario_type)}
    )


@router.post("/seed-dataset", response_model=ApiResponse)
def seed_dataset_template(db: Session = Depends(get_db)) -> ApiResponse:
    seed_drone_view_dataset(db)
    return ApiResponse(
        data={"templateId": DATASET_DEMO_TEMPLATE_ID},
        message="CSV 기반 시연 데이터가 복구되었습니다.",
    )


@router.get("/{template_id}", response_model=ApiResponse)
def get_template(template_id: str, db: Session = Depends(get_db)) -> ApiResponse:
    record = get_scenario_template_record(db, template_id)
    return ApiResponse(data=to_scenario_template_schema(record))


@router.put("/{template_id}", response_model=ApiResponse)
def update_template(
    template_id: str,
    request: ScenarioTemplateUpdateRequest,
    db: Session = Depends(get_db),
) -> ApiResponse:
    values = request.model_dump(exclude_unset=True)
    if request.interferenceZone is not None and "interferenceZone" in values:
        values["interferenceZone"] = request.interferenceZone.model_dump()
    template = update_scenario_template(db, template_id, values=values)
    return ApiResponse(data=template, message="시나리오 템플릿이 수정되었습니다.")


@router.delete("/{template_id}", response_model=ApiResponse)
def delete_template(template_id: str, db: Session = Depends(get_db)) -> ApiResponse:
    result = delete_scenario_template(db, template_id)
    return ApiResponse(data=result, message="시나리오 템플릿이 삭제되었습니다.")
