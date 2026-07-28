# 지휘보고 메인 초기화면 API 계약

프론트엔드 기능 명세서 v1.1 기준으로 로그인 이후 첫 화면인 `지휘보고 메인 화면`에서 사용하는 초기 데이터 API다. 로그인은 나중에 붙이더라도, 현재는 이 API를 바로 호출해서 초기 테이블을 그릴 수 있다.

## 초기화면 데이터 조회

```text
GET /api/dashboard/main
```

응답 구조:

```json
{
  "success": true,
  "data": {
    "screen": "command-report-main",
    "selectedOperationAreaId": "AREA-001",
    "operationAreaTable": {
      "items": [
        {
          "id": "AREA-001",
          "name": "시연 작전지역",
          "latitude": 37.5665,
          "longitude": 126.978,
          "radiusMeters": 1200,
          "createdAt": "2026-07-01T00:00:00Z",
          "updatedAt": "2026-07-01T00:00:00Z",
          "actions": {
            "monitoringSnapshotUrl": "/api/operation-areas/AREA-001/snapshot",
            "scenarioAreaUrl": "/api/operation-areas/AREA-001"
          }
        }
      ],
      "emptyMessage": "저장된 적진지가 없습니다."
    },
    "reportTable": {
      "items": [],
      "emptyMessage": "수신된 보고가 없습니다."
    },
    "uiState": {
      "loginRequired": false,
      "monitoringAutoOpen": false,
      "scenarioAutoRun": false,
      "areaTerm": "적진지"
    },
    "serverTime": "2026-07-01T00:00:00Z"
  },
  "message": "요청이 성공했습니다."
}
```

## 프론트 사용 기준

- 첫 화면 진입 시 `GET /api/dashboard/main`을 호출한다.
- `operationAreaTable.items`는 저장 좌표 목록 또는 카드 목록에 사용한다.
- `reportTable.items`는 수신 보고 목록 테이블에 사용한다.
- `[모니터링]` 버튼은 각 행의 `actions.monitoringSnapshotUrl` 또는 `/api/operation-areas/{areaId}/snapshot`을 사용한다.
- `[시나리오]` 버튼은 `areaId`를 시나리오 창에 전달한다. 좌표 전달만으로 시나리오를 자동 실행하지 않는다.
- 신규 적진지의 snapshot은 드론, 표적, 경로, 활성 시나리오가 빈 배열이어야 한다.

## 관련 API

```text
GET /api/operation-areas
POST /api/operation-areas
PATCH /api/operation-areas/{areaId}
DELETE /api/operation-areas/{areaId}
GET /api/operation-areas/{areaId}/snapshot
GET /api/reports
POST /api/reports
```
