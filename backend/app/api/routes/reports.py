from fastapi import APIRouter, BackgroundTasks, Depends, File, Query, UploadFile
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session
from starlette.responses import StreamingResponse

from app.db import get_db
from app.schemas.common import ApiResponse, Position
from app.schemas.enums import ReportStatus
from app.services.report_service import (
    create_report_attachment_record,
    create_report_record,
    delete_report_record,
    get_attachment_record,
    get_report_record,
    list_report_records,
    to_report_schema,
    update_report_important_record,
    update_report_status_record,
)
from app.services.storage_service import stream_report_file, upload_report_file
from app.websocket.manager import build_realtime_event, realtime_manager

router = APIRouter()


class ReportAttachmentCreateRequest(BaseModel):
    fileName: str = Field(min_length=1, max_length=255)
    contentType: str = Field(min_length=1, max_length=100)
    objectKey: str = Field(min_length=1, max_length=500)
    thumbnailObjectKey: str | None = Field(default=None, max_length=500)


class ReportCreateRequest(BaseModel):
    operationAreaId: str = Field(default="AREA-001", min_length=1, max_length=30)
    title: str = Field(min_length=1, max_length=100)
    summary: str | None = Field(default=None, max_length=2000)
    content: str | None = Field(default=None, max_length=2000)
    clientRequestId: str | None = Field(default=None, max_length=100)
    important: bool = False
    createdBy: str = Field(default="USR-001", min_length=1, max_length=50)
    droneId: str | None = Field(default=None, max_length=50)
    targetId: str | None = Field(default=None, max_length=50)
    scenarioId: str | None = Field(default=None, max_length=50)
    inferenceId: str | None = Field(default=None, max_length=50)
    eventId: str | None = Field(default=None, max_length=50)
    datasetId: str | None = Field(default=None, max_length=50)
    position: Position | None = None
    reportPosition: Position | None = None
    attachments: list[ReportAttachmentCreateRequest] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_content(self) -> "ReportCreateRequest":
        if not self.content and not self.summary:
            raise ValueError("content 또는 summary 중 하나는 필요합니다.")
        return self


class ReportStatusUpdateRequest(BaseModel):
    status: ReportStatus


class ReportImportantUpdateRequest(BaseModel):
    important: bool


@router.get("", response_model=ApiResponse)
def list_reports(
    page_number: int = Query(default=1, alias="page", ge=1),
    size: int = Query(default=20, ge=1, le=100),
    status: ReportStatus | None = None,
    important: bool | None = None,
    search: str | None = Query(default=None, min_length=1),
    operation_area_id: str | None = Query(default=None, alias="operationAreaId"),
    db: Session = Depends(get_db),
) -> ApiResponse:
    reports = list_report_records(
        db,
        page_number=page_number,
        size=size,
        status=status,
        important=important,
        search=search,
        operation_area_id=operation_area_id,
    )
    return ApiResponse(data=reports)


@router.post("", response_model=ApiResponse, status_code=201)
def create_report(
    request: ReportCreateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> ApiResponse:
    content = request.content or request.summary or ""
    report_position = request.reportPosition or request.position
    report = create_report_record(
        db,
        operation_area_id=request.operationAreaId,
        title=request.title,
        summary=content,
        client_request_id=request.clientRequestId,
        created_by=request.createdBy,
        important=request.important,
        drone_id=request.droneId,
        target_id=request.targetId,
        scenario_id=request.scenarioId,
        inference_id=request.inferenceId,
        event_id=request.eventId,
        dataset_id=request.datasetId,
        position=report_position,
        attachments=[
            {
                "file_name": attachment.fileName,
                "content_type": attachment.contentType,
                "object_key": attachment.objectKey,
                "thumbnail_object_key": attachment.thumbnailObjectKey,
            }
            for attachment in request.attachments
        ],
    )
    background_tasks.add_task(
        realtime_manager.broadcast,
        build_realtime_event(
            "report.created",
            operation_area_id=report.operationAreaId,
            entity_id=report.id,
            payload=report,
        ),
    )
    return ApiResponse(data=report, message="보고서가 생성되었습니다.")


@router.get("/{report_id}", response_model=ApiResponse)
def get_report(report_id: str, db: Session = Depends(get_db)) -> ApiResponse:
    return ApiResponse(data=to_report_schema(get_report_record(db, report_id)))


@router.patch("/{report_id}/status", response_model=ApiResponse)
def update_report_status(
    report_id: str,
    request: ReportStatusUpdateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> ApiResponse:
    report = update_report_status_record(db, report_id, request.status)
    background_tasks.add_task(
        realtime_manager.broadcast,
        build_realtime_event(
            "report.status.updated",
            operation_area_id=report.operationAreaId,
            entity_id=report.id,
            payload=report,
        ),
    )
    return ApiResponse(data=report, message="보고서 상태가 변경되었습니다.")


@router.patch("/{report_id}/important", response_model=ApiResponse)
def update_report_important(
    report_id: str,
    request: ReportImportantUpdateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> ApiResponse:
    report = update_report_important_record(db, report_id, request.important)
    background_tasks.add_task(
        realtime_manager.broadcast,
        build_realtime_event(
            "report.important.updated",
            operation_area_id=report.operationAreaId,
            entity_id=report.id,
            payload=report,
        ),
    )
    return ApiResponse(data=report, message="보고서 중요 표시가 변경되었습니다.")


@router.delete("/{report_id}", response_model=ApiResponse)
def delete_report(
    report_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> ApiResponse:
    report = delete_report_record(db, report_id)
    background_tasks.add_task(
        realtime_manager.broadcast,
        build_realtime_event(
            "report.deleted",
            operation_area_id=report.operationAreaId,
            entity_id=report.id,
            payload=report,
        ),
    )
    return ApiResponse(data=report, message="보고서가 삭제되었습니다.")


@router.get("/{report_id}/attachments/{attachment_id}/url", response_model=ApiResponse)
def get_report_attachment_url(
    report_id: str,
    attachment_id: str,
    type: str = Query(default="download", pattern="^(download|thumbnail)$"),
    db: Session = Depends(get_db),
) -> ApiResponse:
    attachment = get_attachment_record(db, report_id, attachment_id)
    object_key = attachment.object_key
    if type == "thumbnail" and attachment.thumbnail_object_key:
        object_key = attachment.thumbnail_object_key

    return ApiResponse(
        data={
            "attachmentId": attachment.id,
            "objectKey": object_key,
            "url": f"/api/reports/{report_id}/attachments/{attachment_id}/download?type={type}",
            "expiresInSeconds": 900,
        }
    )


@router.post("/{report_id}/attachments", response_model=ApiResponse, status_code=201)
async def upload_report_attachment(
    report_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> ApiResponse:
    data = await file.read()
    object_key = upload_report_file(
        file_name=file.filename or "attachment",
        content_type=file.content_type or "application/octet-stream",
        data=data,
    )
    attachment = create_report_attachment_record(
        db,
        report_id,
        file_name=file.filename or "attachment",
        content_type=file.content_type or "application/octet-stream",
        object_key=object_key,
    )
    report = to_report_schema(get_report_record(db, report_id))
    background_tasks.add_task(
        realtime_manager.broadcast,
        build_realtime_event(
            "report.attachment.created",
            operation_area_id=report.operationAreaId,
            entity_id=report.id,
            payload={"report": report, "attachment": attachment},
        ),
    )
    return ApiResponse(data=attachment, message="첨부파일이 업로드되었습니다.")


@router.get("/{report_id}/attachments/{attachment_id}/download")
def download_report_attachment(
    report_id: str,
    attachment_id: str,
    type: str = Query(default="download", pattern="^(download|thumbnail)$"),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    attachment = get_attachment_record(db, report_id, attachment_id)
    object_key = attachment.object_key
    if type == "thumbnail" and attachment.thumbnail_object_key:
        object_key = attachment.thumbnail_object_key

    chunks, content_type = stream_report_file(object_key)
    return StreamingResponse(
        chunks,
        media_type=content_type,
        headers={"Content-Disposition": f'inline; filename="{attachment.file_name}"'},
    )
