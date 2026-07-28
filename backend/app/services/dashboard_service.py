from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.services.operation_area_service import list_operation_area_records
from app.services.report_service import get_recent_report_schemas


def get_main_dashboard_initial_data(db: Session) -> dict[str, object]:
    operation_areas = list_operation_area_records(db)
    reports = get_recent_report_schemas(db, size=20)
    selected_area_id = operation_areas[0].id if operation_areas else None

    return {
        "screen": "command-report-main",
        "selectedOperationAreaId": selected_area_id,
        "operationAreaTable": {
            "items": [
                {
                    "id": area.id,
                    "name": area.name,
                    "latitude": area.latitude,
                    "longitude": area.longitude,
                    "radiusMeters": area.radiusMeters,
                    "createdAt": area.createdAt,
                    "updatedAt": area.updatedAt,
                    "actions": {
                        "monitoringSnapshotUrl": f"/api/operation-areas/{area.id}/snapshot",
                        "scenarioAreaUrl": f"/api/operation-areas/{area.id}",
                    },
                }
                for area in operation_areas
            ],
            "emptyMessage": "저장된 적진지가 없습니다.",
        },
        "reportTable": {
            "items": reports,
            "emptyMessage": "수신된 보고가 없습니다.",
        },
        "uiState": {
            "loginRequired": False,
            "monitoringAutoOpen": False,
            "scenarioAutoRun": False,
            "areaTerm": "적진지",
        },
        "serverTime": datetime.now(UTC),
    }
