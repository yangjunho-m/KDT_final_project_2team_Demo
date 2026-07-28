import json
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.models import ScenarioTemplateRecord


SCENARIO_TEMPLATE_TYPES = {"NORMAL", "JAMMING", "SPOOFING"}


def create_scenario_template(
    db: Session,
    *,
    name: str,
    description: str | None,
    scenario_type: str,
    config: dict[str, object],
    interference_zone: dict[str, object],
    created_by: str,
) -> dict[str, object]:
    now = datetime.now(UTC)
    record = ScenarioTemplateRecord(
        id=f"STP-{uuid4().hex[:12].upper()}",
        name=name.strip(),
        description=_normalize_description(description),
        scenario_type=_normalize_scenario_type(scenario_type),
        config_json=json.dumps(config, ensure_ascii=False),
        interference_zone_json=json.dumps(interference_zone, ensure_ascii=False),
        created_by=created_by.strip(),
        created_at=now,
        updated_at=now,
    )
    db.add(record)
    _commit(db, duplicate_name=name)
    db.refresh(record)
    return to_scenario_template_schema(record)


def list_scenario_templates(
    db: Session,
    *,
    scenario_type: str | None = None,
) -> list[dict[str, object]]:
    statement = select(ScenarioTemplateRecord)
    if scenario_type is not None:
        statement = statement.where(
            ScenarioTemplateRecord.scenario_type == _normalize_scenario_type(scenario_type)
        )
    statement = statement.order_by(ScenarioTemplateRecord.updated_at.desc())
    return [to_scenario_template_schema(record) for record in db.scalars(statement).all()]


def get_scenario_template_record(db: Session, template_id: str) -> ScenarioTemplateRecord:
    record = db.get(ScenarioTemplateRecord, template_id)
    if record is None:
        raise AppError(
            "SCENARIO_TEMPLATE_NOT_FOUND",
            "시나리오 템플릿을 찾을 수 없습니다.",
            status_code=404,
            details={"templateId": template_id},
        )
    return record


def update_scenario_template(
    db: Session,
    template_id: str,
    *,
    values: dict[str, object],
) -> dict[str, object]:
    record = get_scenario_template_record(db, template_id)
    if values.get("name") is not None:
        record.name = str(values["name"]).strip()
    if "description" in values:
        description = values["description"]
        record.description = _normalize_description(
            None if description is None else str(description)
        )
    if values.get("scenarioType") is not None:
        record.scenario_type = _normalize_scenario_type(str(values["scenarioType"]))
    if values.get("config") is not None:
        record.config_json = json.dumps(values["config"], ensure_ascii=False)
    if values.get("interferenceZone") is not None:
        record.interference_zone_json = json.dumps(
            values["interferenceZone"],
            ensure_ascii=False,
        )
    record.updated_at = datetime.now(UTC)
    _commit(db, duplicate_name=record.name)
    db.refresh(record)
    return to_scenario_template_schema(record)


def delete_scenario_template(db: Session, template_id: str) -> dict[str, str]:
    record = get_scenario_template_record(db, template_id)
    db.delete(record)
    db.commit()
    return {"id": template_id}


def to_scenario_template_schema(record: ScenarioTemplateRecord) -> dict[str, object]:
    return {
        "id": record.id,
        "name": record.name,
        "description": record.description,
        "scenarioType": record.scenario_type,
        "config": _load_json_object(record.config_json),
        "interferenceZone": _load_json_object(record.interference_zone_json),
        "createdBy": record.created_by,
        "createdAt": record.created_at,
        "updatedAt": record.updated_at,
    }


def _normalize_scenario_type(scenario_type: str) -> str:
    normalized_type = scenario_type.strip().upper()
    if normalized_type not in SCENARIO_TEMPLATE_TYPES:
        raise AppError(
            "SCENARIO_TEMPLATE_TYPE_INVALID",
            "scenarioType은 NORMAL, JAMMING 또는 SPOOFING이어야 합니다.",
            status_code=422,
        )
    return normalized_type


def _normalize_description(description: str | None) -> str | None:
    if description is None:
        return None
    normalized = description.strip()
    return normalized or None


def _load_json_object(value: str) -> dict[str, object]:
    loaded = json.loads(value)
    return loaded if isinstance(loaded, dict) else {}


def _commit(db: Session, *, duplicate_name: str) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(
            "SCENARIO_TEMPLATE_NAME_DUPLICATED",
            "같은 이름의 시나리오 템플릿이 이미 존재합니다.",
            status_code=409,
            details={"name": duplicate_name},
        ) from exc
