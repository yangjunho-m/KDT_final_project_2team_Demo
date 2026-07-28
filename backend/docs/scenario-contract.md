# 시나리오 API 계약

## 목적

시나리오 시뮬레이터 화면에서 적진지와 대상 드론을 선택한 뒤 재밍 또는 스푸핑 효과를 적용하고 종료한다.

## 핵심 규칙

- 적진지가 반드시 필요하다.
- 대상 드론은 최소 1대 필요하다.
- 드론이 0대인 적진지에서는 시나리오 실행을 거부한다.
- 시나리오 실행 반경은 적진지 원본 반경을 수정하지 않는다.
- 좌표를 전달받아도 자동 실행하지 않고, 명시적인 적용 API 호출이 있어야 실행한다.

## API 목록

| 기능 | Method | Path |
|---|---|---|
| 시나리오 가능 드론 조회 | GET | `/api/operation-areas/{areaId}/scenario-ready-drones` |
| 시나리오 미리보기 검증 | POST | `/api/scenarios/preview` |
| 시나리오 적용 | POST | `/api/scenarios` |
| 활성 시나리오 조회 | GET | `/api/scenarios/active?operationAreaId={areaId}` |
| 시나리오 상세 조회 | GET | `/api/scenarios/{scenarioId}` |
| 시나리오 종료 | POST | `/api/scenarios/{scenarioId}/end` |

## 시나리오 적용 요청 예시

```json
{
  "operationAreaId": "AREA-001",
  "scenarioName": "GNSS 재밍 시연",
  "targetDroneIds": ["DRN-001"],
  "effectType": "JAMMING",
  "intensity": 0.75,
  "durationMs": 60000,
  "seed": 42,
  "autoRecovery": true,
  "centerPosition": {
    "latitude": 37.5665,
    "longitude": 126.978,
    "altitude": 0
  },
  "radiusMeters": 500
}
```

`centerPosition`과 `radiusMeters`를 생략하면 적진지 중심 좌표와 적진지 반경을 기본값으로 사용한다.

## 시나리오 응답 예시

```json
{
  "success": true,
  "data": {
    "id": "SCN-001",
    "operationAreaId": "AREA-001",
    "scenarioName": "GNSS 재밍 시연",
    "targetDroneIds": ["DRN-001"],
    "effect": {
      "type": "JAMMING",
      "intensity": 0.75,
      "center": {
        "latitude": 37.5665,
        "longitude": 126.978,
        "altitude": 0
      },
      "radiusM": 500,
      "durationMs": 60000
    },
    "seed": 42,
    "status": "RUNNING",
    "autoRecovery": true,
    "startedAt": "2026-07-02T00:00:00Z",
    "endedAt": null
  },
  "message": "시나리오가 적용되었습니다."
}
```

## snapshot 반영

시나리오 적용 후 다음 API의 `activeScenarios` 배열에 실행 중인 시나리오가 포함된다.

```text
GET /api/operation-areas/{areaId}/snapshot
```

또한 `events` 배열에는 `scenario.started` 이벤트가 포함된다.

## 오류 코드

| 코드 | 의미 |
|---|---|
| `OPERATION_AREA_NOT_FOUND` | 적진지를 찾을 수 없음 |
| `SCENARIO_TARGET_DRONE_REQUIRED` | 대상 드론이 없음 |
| `SCENARIO_NO_DRONES` | 적진지에 등록된 드론이 0대 |
| `SCENARIO_DRONE_AREA_MISMATCH` | 다른 적진지의 드론이 포함됨 |
| `INVALID_SCENARIO_INTENSITY` | 강도 값이 잘못됨 |
| `INVALID_SCENARIO_DURATION` | 지속시간이 잘못됨 |
| `INVALID_SCENARIO_RADIUS` | 반경이 잘못됨 |
| `SCENARIO_NOT_FOUND` | 시나리오를 찾을 수 없음 |
| `SCENARIO_NOT_RUNNING` | 실행 중인 시나리오가 아님 |
