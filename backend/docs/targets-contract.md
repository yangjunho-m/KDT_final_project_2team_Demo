# 표적 API 계약

표적은 적진지 생성과 동시에 자동 생성하지 않는다. AI 탐지, 시뮬레이션, 또는 시연 입력으로 별도 생성하며, 생성된 표적은 해당 적진지 snapshot의 `targets` 배열에 포함된다.

## 적진지 표적 목록

```text
GET /api/operation-areas/{areaId}/targets
```

## 표적 생성

```text
POST /api/operation-areas/{areaId}/targets
```

요청:

```json
{
  "type": "VEHICLE",
  "position": {
    "latitude": 37.5671,
    "longitude": 126.9798,
    "altitude": 0
  },
  "confidence": 0.92,
  "movementDirection": 45,
  "movementSpeed": 3.5
}
```

응답 주요 필드:

```json
{
  "id": "TGT-001",
  "operationAreaId": "AREA-001",
  "type": "VEHICLE",
  "status": "ACTIVE",
  "position": {
    "latitude": 37.5671,
    "longitude": 126.9798,
    "altitude": 0
  },
  "confidence": 0.92,
  "movementDirection": 45,
  "movementSpeed": 3.5,
  "lastUpdatedAt": "2026-07-02T00:00:00Z"
}
```

## 전체 표적 목록

```text
GET /api/targets
GET /api/targets?operationAreaId=AREA-001
GET /api/targets/active?operationAreaId=AREA-001
```

## 표적 상세

```text
GET /api/targets/{targetId}
```

## 표적 수정

```text
PATCH /api/targets/{targetId}
```

요청은 바꿀 필드만 보내면 된다.

```json
{
  "status": "LOST",
  "confidence": 0.4
}
```

## 표적 제거

```text
DELETE /api/targets/{targetId}
```

표적은 DB에서 바로 지우지 않고 `REMOVED` 상태와 삭제 플래그로 처리한다.

## Snapshot 반영

```text
GET /api/operation-areas/{areaId}/snapshot
```

표적이 있으면 `targets` 배열과 `events` 배열에 반영된다.
