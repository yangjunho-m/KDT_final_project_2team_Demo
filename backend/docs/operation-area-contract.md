# 작전지역 API 계약서

## 1. 문서 목적

이 문서는 프론트엔드가 작전지역 기능을 연동할 때 필요한 백엔드 API 계약을 정리한다.
작전지역은 드론, 표적, 보고, 시나리오 실행의 기준이 되는 핵심 도메인이다.

## 2. 기본 경로

- Base URL: `http://example.com`
- API Prefix: `/api`
- Resource Path: `/api/operation-areas`

## 3. 공통 응답 형식

성공 응답:

```json
{
  "success": true,
  "data": {},
  "message": "요청이 성공했습니다."
}
```

오류 응답:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "오류 메시지",
    "details": {},
    "timestamp": "2026-07-09T00:00:00Z"
  }
}
```

## 4. 작전지역 생성

- Method: `POST`
- URL: `/api/operation-areas`
- 설명: 신규 작전지역을 생성한다.

요청 예시:

```json
{
  "name": "북서 작전지",
  "latitude": 37.5665,
  "longitude": 126.978,
  "radiusMeters": 500
}
```

응답 예시:

```json
{
  "success": true,
  "data": {
    "id": "AREA-001",
    "name": "북서 작전지",
    "latitude": 37.5665,
    "longitude": 126.978,
    "radiusMeters": 500,
    "createdAt": "2026-07-09T00:00:00Z",
    "updatedAt": "2026-07-09T00:00:00Z",
    "similarAreaWarning": null
  },
  "message": "작전지역이 생성되었습니다."
}
```

## 5. 유사 작전지역 경고

작전지역 생성 시 기존 작전지역과 30m 이내로 가까우면 `similarAreaWarning` 필드가 포함될 수 있다.

응답 예시:

```json
{
  "success": true,
  "data": {
    "id": "AREA-002",
    "name": "동부 작전지",
    "latitude": 37.5667,
    "longitude": 126.9782,
    "radiusMeters": 420,
    "similarAreaWarning": {
      "enabled": true,
      "distanceMeters": 24.5,
      "similarArea": {
        "id": "AREA-001",
        "name": "북서 작전지",
        "latitude": 37.5665,
        "longitude": 126.978
      },
      "message": "30m 이내에 유사 작전지역이 있습니다."
    }
  },
  "message": "작전지역이 생성되었습니다."
}
```

프론트 처리:

- `similarAreaWarning.enabled=true`이면 경고 메시지를 표시한다.
- 현재는 생성 자체를 막지는 않는다.
- 추후 정책 변경 시 백엔드에서 오류 코드로 차단할 수 있다.

## 6. 작전지역 목록 조회

- Method: `GET`
- URL: `/api/operation-areas`
- 설명: 저장된 작전지역 목록을 조회한다.

응답 주요 필드:

- `items`: 작전지역 목록
- `id`: 작전지역 ID
- `name`: 작전지역 이름
- `latitude`: 중심 위도
- `longitude`: 중심 경도
- `radiusMeters`: 반경
- `createdAt`: 생성 시각
- `updatedAt`: 수정 시각

## 7. 작전지역 상세 조회

- Method: `GET`
- URL: `/api/operation-areas/{areaId}`
- 설명: 특정 작전지역 상세 정보를 조회한다.

경로 변수:

- `areaId`: 작전지역 ID

## 8. 작전지역 수정

- Method: `PATCH`
- URL: `/api/operation-areas/{areaId}`
- 설명: 작전지역 이름, 좌표, 반경을 수정한다.

요청 예시:

```json
{
  "name": "북서 작전지 수정",
  "latitude": 37.567,
  "longitude": 126.979,
  "radiusMeters": 600
}
```

## 9. 작전지역 삭제

- Method: `DELETE`
- URL: `/api/operation-areas/{areaId}`
- 설명: 작전지역을 삭제한다.

삭제 성공 응답:

```json
{
  "success": true,
  "data": {
    "id": "AREA-001"
  },
  "message": "작전지역이 삭제되었습니다."
}
```

삭제 정책:

- 배정된 드론이 있으면 삭제를 차단한다.
- 활성 시나리오 실행 중이면 삭제를 차단한다.
- 종료된 시나리오 이력은 삭제 시 자동 정리한다.
- soft-delete 표적, 보고, 첨부, 추론 이력 등 비활성 종속 데이터는 삭제 시 자동 정리한다.
- 정리되지 않은 FK 데이터가 남아 있으면 `OPERATION_AREA_DELETE_CONFLICT` 오류를 반환한다.

대표 오류:

```json
{
  "success": false,
  "error": {
    "code": "OPERATION_AREA_DELETE_CONFLICT",
    "message": "작전지역에 정리되지 않은 연결 데이터가 남아 있어 삭제할 수 없습니다.",
    "details": {
      "areaId": "AREA-001"
    },
    "timestamp": "2026-07-09T00:00:00Z"
  }
}
```

## 10. 작전지역 스냅샷 조회

- Method: `GET`
- URL: `/api/operation-areas/{areaId}/snapshot`
- 설명: 모니터링 화면에 필요한 작전지역 상태를 한 번에 조회한다.

응답 주요 필드:

- `area`: 작전지역 정보
- `drones`: 작전지역에 배정된 드론 목록
- `targets`: 작전지역 내 표적 목록
- `reports`: 작전지역 관련 보고 목록
- `activeScenarioRuns`: 실행 중인 시나리오 목록
- `events`: 최근 이벤트 목록

프론트 사용처:

- 통합 모니터링 화면 초기 렌더링
- 지도 마커 표시
- 드론 카드 표시
- 표적 정보 표시
- 보고 목록 표시
- 시나리오 상태 복구

## 11. 작전지역에 드론 등록

- Method: `POST`
- URL: `/api/operation-areas/{areaId}/drones`
- 설명: 특정 작전지역에 드론을 등록한다.

요청 예시:

```json
{
  "name": "DRONE-001",
  "model": "Scout-A",
  "missionType": "정찰",
  "departurePosition": {
    "latitude": 37.5665,
    "longitude": 126.978,
    "altitude": 120
  }
}
```

정책:

- 한 작전지역에는 최대 5대까지 드론을 등록할 수 있다.
- 6대째 등록 시 `AREA_DRONE_LIMIT_EXCEEDED` 오류가 발생한다.

## 12. 작전지역 드론 배정 해제

- Method: `DELETE`
- URL: `/api/operation-areas/{areaId}/drones/{droneId}`
- 설명: 드론 레코드는 유지하고 작전지역 배정만 해제한다.

주의:

- 이 API는 드론을 완전히 삭제하지 않는다.
- 완전 삭제가 필요하면 `DELETE /api/drones/{droneId}`를 사용한다.

## 13. 프론트 처리 규칙

프론트는 다음 규칙을 따른다.

- 작전지역이 0개이면 모니터링 진입을 막고 안내 메시지를 표시한다.
- 작전지역 생성 응답에 `similarAreaWarning`이 있으면 경고를 표시한다.
- 삭제 실패 시 백엔드 오류 메시지를 그대로 사용자에게 표시한다.
- 작전지역 상세 화면 진입 시 `snapshot` API를 먼저 호출한다.
- WebSocket 연결은 선택한 작전지역 ID를 쿼리 파라미터로 전달한다.

## 14. 관련 API

작전지역 기능과 함께 사용하는 API:

- `GET /api/dashboard/main`
- `GET /api/drones`
- `POST /api/operation-areas/{areaId}/drones`
- `GET /api/targets?operationAreaId={areaId}`
- `GET /api/reports?operationAreaId={areaId}`
- `POST /api/scenario-runs`
- `GET /api/scenario-runs/active?areaId={areaId}`
- `GET /api/scenario-runs/{runId}/runtimes`

## 15. 관련 WebSocket 이벤트

작전지역 화면에서 처리할 수 있는 이벤트:

- `operation-area.created`
- `operation-area.updated`
- `operation-area.deleted`
- `DRONE_POSITION_UPDATED`
- `DRONE_ENTERED_ZONE`
- `DRONE_EXITED_ZONE`
- `JAMMING_DETECTED`
- `SPOOFING_DETECTED`
- `CROSS_VIEW_CORRECTED`
- `SCENARIO_RUN_STARTED`
- `SCENARIO_RUN_STOPPING`
- `SCENARIO_RUN_STOPPED`
