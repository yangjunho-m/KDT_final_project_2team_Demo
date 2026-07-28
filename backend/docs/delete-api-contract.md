# Delete API Contract

작성일: 2026-07-07

프론트 E2E 검증과 리허설 데이터 정리를 위해 soft-delete API를 추가한다.

## 리포트 삭제

```text
DELETE /api/reports/{reportId}
```

동작:

- `reports.is_deleted = true`로 soft-delete 처리한다.
- 기존 리포트 목록/상세 조회에서는 삭제된 리포트를 반환하지 않는다.
- 응답 schema는 기존 `ApiResponse` 구조를 유지한다.
- WebSocket 이벤트 `report.deleted`를 발행한다.

응답 예시:

```json
{
  "success": true,
  "data": {
    "id": "RPT-001",
    "operationAreaId": "AREA-001",
    "title": "테스트 보고"
  },
  "message": "보고서가 삭제되었습니다."
}
```

## 드론 레코드 삭제

```text
DELETE /api/drones/{droneId}
```

동작:

- `drones.is_deleted = true`로 soft-delete 처리한다.
- 삭제 시 `operationAreaId`는 `null`, `status`는 `UNASSIGNED`로 정리한다.
- 이동 목표 관련 필드는 `null`로 정리한다.
- 기존 드론 목록/상세 조회에서는 삭제된 드론을 반환하지 않는다.
- 기존 배정 해제 API `DELETE /api/operation-areas/{areaId}/drones/{droneId}`는 그대로 유지한다.
- WebSocket 이벤트 `drone.deleted`를 발행한다.

응답 예시:

```json
{
  "success": true,
  "data": {
    "id": "DRN-001",
    "operationAreaId": null,
    "status": "UNASSIGNED"
  },
  "message": "드론이 삭제되었습니다."
}
```

## 작전지역 삭제 차단 정책

```text
DELETE /api/operation-areas/{areaId}
```

아래 종속 데이터가 있으면 작전지역 삭제를 차단하고 `409`를 반환한다.

| error.code | 조건 |
|---|---|
| `OPERATION_AREA_HAS_ACTIVE_SCENARIO_RUNS` | `STARTING`, `RUNNING`, `STOPPING` 상태의 scenario run 존재 |
| `OPERATION_AREA_HAS_SCENARIO_RUN_HISTORY` | 완료/중지 포함 scenario run 이력 존재 |
| `OPERATION_AREA_HAS_ASSIGNED_DRONES` | 삭제되지 않은 배정 드론 존재 |
| `OPERATION_AREA_HAS_TARGETS` | 삭제되지 않은 표적 존재 |
| `OPERATION_AREA_HAS_REPORTS` | 삭제되지 않은 리포트 존재 |

차단 응답 예시:

```json
{
  "success": false,
  "error": {
    "code": "OPERATION_AREA_HAS_ASSIGNED_DRONES",
    "message": "배정된 드론이 있는 작전지역은 삭제할 수 없습니다.",
    "details": {
      "assignedDroneCount": 1
    }
  }
}
```

종속 데이터가 없으면 기존처럼 `operation-area.deleted` WebSocket 이벤트를 발행한다.
