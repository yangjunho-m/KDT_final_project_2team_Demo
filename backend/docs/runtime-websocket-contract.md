# Runtime WebSocket / Scenario Runtime Contract

작성일: 2026-07-06

이 문서는 기존 프론트 계약을 유지하면서 추가한 runtime 이벤트/상태 복구 계약만 정리한다.

## 유지 원칙

- 기존 API URL은 변경하지 않는다.
- 기존 WebSocket `eventType` / `type` 이름은 변경하지 않는다.
- 기존 `areaId`, `operationAreaId`, `runId`, `droneId`, `timestamp`, `position` 필드는 제거하지 않는다.
- 기존 enum 값은 변경하지 않는다.
- runtime 이벤트는 기존 flat envelope 구조를 유지한다.
- 새 값은 optional 필드로만 추가한다.

## Runtime 이벤트 공통 추가 필드

`DRONE_POSITION_UPDATED`를 포함한 scenario runtime 이벤트에 아래 필드를 추가한다.

```json
{
  "eventId": "RUN-20260706-001-EVT-ABCDEF123456",
  "sequence": 1,
  "eventType": "DRONE_POSITION_UPDATED",
  "type": "DRONE_POSITION_UPDATED",
  "runId": "RUN-20260706-001",
  "areaId": "AREA-E2E-001",
  "operationAreaId": "AREA-E2E-001",
  "droneId": "DRN-E2E-001",
  "entityId": "DRN-E2E-001",
  "timestamp": "2026-07-06T00:00:00Z",
  "occurredAt": "2026-07-06T00:00:00Z",
  "positionTimestamp": "2026-07-06T00:00:00Z",
  "position": {
    "latitude": 37.5665,
    "longitude": 126.978,
    "altitude": 120
  },
  "viewImageUrl": "/api/drones/DRN-E2E-001/images/card/download?objectKey=drones%2FDRN-E2E-001%2Fcard%2Fframe.png"
}
```

필드 의미:

- `eventId`: 이벤트 고유 ID
- `sequence`: 같은 `runId` 안에서 증가하는 이벤트 순번
- `timestamp`: 기존 필드 유지, 이벤트 생성 시각
- `occurredAt`: 이벤트 발생 시각, 현재는 `timestamp`와 동일
- `positionTimestamp`: 위치 계산/갱신 시각, `position`이 있는 이벤트에 포함

## 상태 UI용 이벤트 필드

기존 nested 객체는 유지하고, 프론트 상태 UI가 바로 읽을 수 있는 optional top-level 필드를 추가한다.

### JAMMING_DETECTED

```json
{
  "eventType": "JAMMING_DETECTED",
  "interference": {
    "type": "JAMMING",
    "targetSystem": "GNSS",
    "intensity": "HIGH",
    "status": "DETECTED"
  },
  "interferenceType": "JAMMING",
  "severity": "HIGH",
  "targetSystem": "GNSS"
}
```

### SPOOFING_DETECTED

```json
{
  "eventType": "SPOOFING_DETECTED",
  "interference": {
    "type": "SPOOFING",
    "severity": "MEDIUM",
    "status": "MISMATCH_DETECTED"
  },
  "interferenceType": "SPOOFING",
  "severity": "MEDIUM",
  "reportedPosition": {},
  "trustedPosition": {}
}
```

### NAVIGATION_STATUS_CHANGED

```json
{
  "eventType": "NAVIGATION_STATUS_CHANGED",
  "navigation": {
    "gnss": "DEGRADED",
    "communication": "NORMAL",
    "ins": "ASSISTING",
    "crossView": "PREPARING"
  },
  "gnssStatus": "DEGRADED",
  "insStatus": "ASSISTING",
  "communicationStatus": "NORMAL",
  "crossViewStatus": "PREPARING",
  "mode": "CROSS_VIEW_ASSISTED"
}
```

### CROSS_VIEW_PREPARING / CROSS_VIEW_STARTED / CROSS_VIEW_CORRECTED

```json
{
  "eventType": "CROSS_VIEW_STARTED",
  "crossView": {
    "previousStatus": "PREPARING",
    "status": "ACTIVE",
    "confidence": 0.75,
    "matchScore": 0.75
  },
  "status": "ACTIVE",
  "confidence": 0.75
}
```

## Runtime 상태 복구 API

새로고침 또는 WebSocket 재연결 시 놓친 현재 상태를 복구한다.

```text
GET /api/scenario-runs/{runId}/runtimes
```

응답:

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "runId": "RUN-20260706-001",
        "droneId": "DRN-E2E-001",
        "actualPosition": {},
        "position": {},
        "navigationStatus": {
          "gnssStatus": "DEGRADED",
          "insStatus": "ASSISTING",
          "communicationStatus": "NORMAL",
          "crossViewStatus": "PREPARING",
          "mode": "CROSS_VIEW_ASSISTED"
        },
        "interferenceStatus": {
          "type": "JAMMING",
          "status": "DETECTED",
          "severity": "HIGH",
          "targetSystem": "GNSS"
        },
        "crossViewStatus": "PREPARING",
        "reportedPosition": null,
        "trustedPosition": {},
        "insideInterferenceZone": true,
        "phase": "JAMMING_DETECTED",
        "updatedAt": "2026-07-06T00:00:00Z"
      }
    ]
  },
  "message": "요청이 성공했습니다."
}
```

## CORS

개발 편의를 위해 아래 origin을 추가 허용한다.

```text
http://127.0.0.1:5173
```

서버 `.env`에서 `CORS_ORIGINS`를 직접 관리하는 경우에도 이 값을 추가해야 적용된다.
