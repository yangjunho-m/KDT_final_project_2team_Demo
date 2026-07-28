from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.errors import AppError
from app.db.models import OperationAreaRecord, ReportAttachmentRecord, ReportRecord, TargetRecord
from app.schemas.common import PageMeta, Position
from app.schemas.domain import Report, ReportAttachment
from app.schemas.enums import ReportStatus
from app.services.operation_area_service import DEMO_OPERATION_AREA_ID


def list_report_records(
    db: Session,
    page_number: int,
    size: int,
    status: ReportStatus | None = None,
    important: bool | None = None,
    search: str | None = None,
    operation_area_id: str | None = None,
) -> dict[str, object]:
    statement = select(ReportRecord).where(ReportRecord.is_deleted.is_(False))
    count_statement = select(func.count()).select_from(ReportRecord).where(
        ReportRecord.is_deleted.is_(False)
    )

    if operation_area_id is not None:
        statement = statement.where(ReportRecord.operation_area_id == operation_area_id)
        count_statement = count_statement.where(ReportRecord.operation_area_id == operation_area_id)
    if status is not None:
        statement = statement.where(ReportRecord.status == status.value)
        count_statement = count_statement.where(ReportRecord.status == status.value)
    if important is not None:
        statement = statement.where(ReportRecord.important.is_(important))
        count_statement = count_statement.where(ReportRecord.important.is_(important))
    if search:
        keyword = f"%{search}%"
        statement = statement.where(
            ReportRecord.title.ilike(keyword) | ReportRecord.summary.ilike(keyword)
        )
        count_statement = count_statement.where(
            ReportRecord.title.ilike(keyword) | ReportRecord.summary.ilike(keyword)
        )

    total = db.scalar(count_statement) or 0
    records = db.scalars(
        statement.options(selectinload(ReportRecord.attachments))
        .order_by(ReportRecord.created_at.desc())
        .offset((page_number - 1) * size)
        .limit(size)
    ).all()
    return {
        "items": [to_report_schema(record) for record in records],
        "page": PageMeta(page=page_number, size=size, total=total),
    }


def get_recent_report_schemas(db: Session, size: int = 20) -> list[Report]:
    records = db.scalars(
        select(ReportRecord)
        .options(selectinload(ReportRecord.attachments))
        .where(ReportRecord.is_deleted.is_(False))
        .order_by(ReportRecord.created_at.desc())
        .limit(size)
    ).all()
    return [to_report_schema(record) for record in records]


def get_report_record(db: Session, report_id: str) -> ReportRecord:
    record = db.scalar(
        select(ReportRecord)
        .options(selectinload(ReportRecord.attachments))
        .where(ReportRecord.id == report_id, ReportRecord.is_deleted.is_(False))
    )
    if record is None:
        raise AppError("REPORT_NOT_FOUND", "보고서를 찾을 수 없습니다.", status_code=404)
    return record


def create_report_record(
    db: Session,
    *,
    title: str,
    summary: str,
    created_by: str,
    operation_area_id: str | None = DEMO_OPERATION_AREA_ID,
    client_request_id: str | None = None,
    important: bool = False,
    drone_id: str | None = None,
    target_id: str | None = None,
    scenario_id: str | None = None,
    inference_id: str | None = None,
    event_id: str | None = None,
    dataset_id: str | None = None,
    position: Position | None = None,
    attachments: list[dict[str, str | None]] | None = None,
) -> Report:
    if operation_area_id is not None:
        _ensure_operation_area_exists(db, operation_area_id)
    if target_id is not None:
        _ensure_target_exists(db, target_id, operation_area_id)
    if client_request_id:
        existing_report = db.scalar(
            select(ReportRecord).where(
                ReportRecord.client_request_id == client_request_id,
                ReportRecord.is_deleted.is_(False),
            )
        )
        if existing_report is not None:
            return to_report_schema(get_report_record(db, existing_report.id))

    report_id = _next_report_id()
    record = ReportRecord(
        id=report_id,
        operation_area_id=operation_area_id,
        title=title,
        summary=summary,
        client_request_id=client_request_id,
        status=ReportStatus.NEW.value,
        important=important,
        created_by=created_by,
        drone_id=drone_id,
        target_id=target_id,
        scenario_id=scenario_id,
        inference_id=inference_id,
        event_id=event_id,
        dataset_id=dataset_id,
        latitude=position.latitude if position else None,
        longitude=position.longitude if position else None,
        altitude=position.altitude if position else None,
    )
    for attachment in attachments or []:
        record.attachments.append(
            ReportAttachmentRecord(
                id=f"ATT-{uuid4().hex[:16].upper()}",
                file_name=str(attachment["file_name"]),
                content_type=str(attachment["content_type"]),
                object_key=str(attachment["object_key"]),
                thumbnail_object_key=attachment.get("thumbnail_object_key"),
            )
        )

    db.add(record)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        if client_request_id:
            existing_report = db.scalar(
                select(ReportRecord).where(
                    ReportRecord.client_request_id == client_request_id,
                    ReportRecord.is_deleted.is_(False),
                )
            )
            if existing_report is not None:
                return to_report_schema(get_report_record(db, existing_report.id))
        raise AppError(
            "REPORT_CREATE_CONFLICT",
            "보고서 생성 중 중복 요청 또는 ID 충돌이 발생했습니다.",
            status_code=409,
        ) from error
    db.refresh(record)
    return to_report_schema(get_report_record(db, report_id))


def update_report_status_record(db: Session, report_id: str, status: ReportStatus) -> Report:
    record = get_report_record(db, report_id)
    now = datetime.now(UTC)
    record.status = status.value
    if status == ReportStatus.CONFIRMED:
        record.confirmed_at = record.confirmed_at or now
    if status == ReportStatus.CLOSED:
        record.closed_at = record.closed_at or now
    db.commit()
    return to_report_schema(get_report_record(db, report_id))


def update_report_important_record(db: Session, report_id: str, important: bool) -> Report:
    record = get_report_record(db, report_id)
    record.important = important
    db.commit()
    return to_report_schema(get_report_record(db, report_id))


def delete_report_record(db: Session, report_id: str) -> Report:
    record = get_report_record(db, report_id)
    report = to_report_schema(record)
    record.is_deleted = True
    db.commit()
    return report


def create_report_attachment_record(
    db: Session,
    report_id: str,
    *,
    file_name: str,
    content_type: str,
    object_key: str,
    thumbnail_object_key: str | None = None,
) -> ReportAttachment:
    get_report_record(db, report_id)
    attachment = ReportAttachmentRecord(
        id=_next_attachment_id(),
        report_id=report_id,
        file_name=file_name,
        content_type=content_type,
        object_key=object_key,
        thumbnail_object_key=thumbnail_object_key,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return to_attachment_schema(attachment)


def get_attachment_record(
    db: Session,
    report_id: str,
    attachment_id: str,
) -> ReportAttachmentRecord:
    get_report_record(db, report_id)
    attachment = db.scalar(
        select(ReportAttachmentRecord).where(
            ReportAttachmentRecord.report_id == report_id,
            ReportAttachmentRecord.id == attachment_id,
        )
    )
    if attachment is None:
        raise AppError("ATTACHMENT_NOT_FOUND", "첨부파일을 찾을 수 없습니다.", status_code=404)
    return attachment


def seed_demo_reports(db: Session) -> None:
    existing_count = db.scalar(select(func.count()).select_from(ReportRecord)) or 0
    if existing_count > 0:
        records_without_area = db.scalars(
            select(ReportRecord).where(ReportRecord.operation_area_id.is_(None))
        ).all()
        for record in records_without_area:
            record.operation_area_id = DEMO_OPERATION_AREA_ID
        if records_without_area:
            db.commit()
        return

    create_report_record(
        db,
        operation_area_id=DEMO_OPERATION_AREA_ID,
        title="이동 표적 발견",
        summary="작전지역 북동쪽에서 이동 표적이 감지되었습니다.",
        created_by="USR-001",
        important=True,
        drone_id="DRN-001",
        dataset_id="DST-001",
        position=Position(latitude=37.5680, longitude=126.9811, altitude=0),
        attachments=[
            {
                "file_name": "target-preview.jpg",
                "content_type": "image/jpeg",
                "object_key": "reports/RPT-001/target-preview.jpg",
                "thumbnail_object_key": "reports/RPT-001/target-preview-thumb.jpg",
            }
        ],
    )
    create_report_record(
        db,
        operation_area_id=DEMO_OPERATION_AREA_ID,
        title="GNSS 상태 저하",
        summary="Bravo-2에서 GNSS 위성 수 감소와 경로 이탈 가능성이 발생했습니다.",
        created_by="system",
        important=False,
        drone_id="DRN-002",
        event_id="EVT-120",
        position=Position(latitude=37.5652, longitude=126.9758, altitude=115),
    )
    update_report_status_record(db, "RPT-002", ReportStatus.CONFIRMED)


def to_report_schema(record: ReportRecord) -> Report:
    position = None
    if record.latitude is not None and record.longitude is not None:
        position = Position(
            latitude=record.latitude,
            longitude=record.longitude,
            altitude=record.altitude,
        )

    return Report(
        id=record.id,
        operationAreaId=record.operation_area_id,
        title=record.title,
        summary=record.summary,
        content=record.summary,
        clientRequestId=record.client_request_id,
        status=ReportStatus(record.status),
        important=record.important,
        createdBy=record.created_by,
        droneId=record.drone_id,
        targetId=record.target_id,
        scenarioId=record.scenario_id,
        inferenceId=record.inference_id,
        eventId=record.event_id,
        datasetId=record.dataset_id,
        position=position,
        reportPosition=position,
        createdAt=record.created_at,
        confirmedAt=record.confirmed_at,
        closedAt=record.closed_at,
        attachments=[to_attachment_schema(attachment) for attachment in record.attachments],
    )


def to_attachment_schema(record: ReportAttachmentRecord) -> ReportAttachment:
    thumbnail_url = None
    if record.thumbnail_object_key:
        thumbnail_url = (
            f"/api/reports/{record.report_id}/attachments/{record.id}/url?type=thumbnail"
        )

    return ReportAttachment(
        id=record.id,
        fileName=record.file_name,
        contentType=record.content_type,
        objectKey=record.object_key,
        thumbnailUrl=thumbnail_url,
        downloadUrl=f"/api/reports/{record.report_id}/attachments/{record.id}/url",
    )


def _ensure_operation_area_exists(db: Session, operation_area_id: str) -> None:
    if db.get(OperationAreaRecord, operation_area_id) is None:
        raise AppError("OPERATION_AREA_NOT_FOUND", "작전지역을 찾을 수 없습니다.", status_code=404)


def _ensure_target_exists(
    db: Session,
    target_id: str,
    operation_area_id: str | None,
) -> None:
    target = db.get(TargetRecord, target_id)
    if target is None or target.is_deleted:
        raise AppError("TARGET_NOT_FOUND", "표적을 찾을 수 없습니다.", status_code=404)
    if operation_area_id is not None and target.operation_area_id != operation_area_id:
        raise AppError("TARGET_AREA_MISMATCH", "해당 작전지역에 속한 표적이 아닙니다.")


def _next_report_id() -> str:
    return f"RPT-{uuid4().hex[:12].upper()}"


def _next_attachment_id() -> str:
    return f"ATT-{uuid4().hex[:16].upper()}"
