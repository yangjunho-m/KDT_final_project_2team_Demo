# WebSocket 이벤트 계약

## 목적

프론트엔드가 통합 모니터링, 지휘보고, 시나리오 화면에서 상태 변경을 실시간으로 받을 수 있도록 한다.

시연용에서는 REST snapshot 재조회로도 화면 갱신이 가능하지만, WebSocket을 연결하면 변경 이벤트를 즉시 받을 수 있다.

## 연결 URL

전체 이벤트 구독:

```text
ws://example.com:8000/ws/realtime
```

특정 적진지 이벤트만 구독:

```text
ws://example.com:8000/ws/realtime?operationAreaId=AREA-001
```

`operationAreaId`를 지정하면 해당 적진지 이벤트만 수신한다.

## 연결 직후 이벤트

```json
{
  "type": "websocket.connected",
  "eventType": "websocket.connected",
  "operationAreaId": "AREA-001",
  "entityId": "websocket",
  "eventId": "EVT-...",
  "occurredAt": "2026-07-02T00:00:00Z",
  "payload": {
    "message": "실시간 이벤트 연결이 완료되었습니다.",
    "operationAreaId": "AREA-001"
  }
}
```

## 공통 이벤트 구조

```json
{
  "type": "drone.created",
  "eventType": "drone.created",
  "operationAreaId": "AREA-001",
  "entityId": "DRN-001",
  "eventId": "EVT-123456789ABC",
  "occurredAt": "2026-07-02T00:00:00Z",
  "payload": {}
}
```

`type`과 `eventType`은 같은 값이다. 프론트에서는 둘 중 하나를 기준으로 처리하면 된다.

## 현재 발행되는 이벤트

| 이벤트 | 발생 시점 |
|---|---|
| `operation-area.created` | 적진지 생성 |
| `operation-area.updated` | 적진지 수정 |
| `operation-area.deleted` | 적진지 삭제 |
| `drone.created` | 드론 등록 |
| `drone.updated` | 드론 정보 수정 |
| `drone.unassigned` | 드론 배정 해제 |
| `drone.movement-target.applied` | 이동 좌표 지정 |
| `drone.image.updated` | 드론 이미지 업로드 |
| `drone.image.deleted` | 드론 이미지 삭제 |
| `target.created` | 표적 생성 |
| `target.updated` | 표적 수정 |
| `target.removed` | 표적 삭제 |
| `report.created` | 상황 보고 생성 |
| `report.status.updated` | 보고 상태 변경 |
| `report.important.updated` | 보고 중요 여부 변경 |
| `report.attachment.created` | 보고 첨부파일 업로드 |
| `scenario.started` | 시나리오 적용 |
| `scenario.ended` | 시나리오 종료 |
| `SCENARIO_STARTED` | 적진지 단위 시나리오 실행 시작 |
| `SCENARIO_STOPPING` | 적진지 단위 시나리오 중지 준비 |
| `SCENARIO_STOPPED` | 적진지 단위 시나리오 실행 중지 |
| `DRONE_POSITION_UPDATED` | 시나리오 tick으로 드론 위치 갱신 |
| `DRONE_ENTERED_ZONE` | 드론이 교란 구역에 진입 |
| `DRONE_EXITED_ZONE` | 드론이 교란 구역에서 이탈 |
| `JAMMING_DETECTED` | 드론별 재밍 감지 |
| `SPOOFING_DETECTED` | 드론별 스푸핑 감지 |
| `NAVIGATION_STATUS_CHANGED` | 드론별 항법 상태 변경 |
| `CROSS_VIEW_PREPARING` | Cross-view 보정 준비 |
| `CROSS_VIEW_STARTED` | Cross-view 보정 시작 |
| `CROSS_VIEW_CORRECTED` | Cross-view 보정 완료 |
| `heartbeat` | 프론트가 `ping` 전송 |

## 프론트 권장 처리

1. WebSocket 연결
2. 연결 성공 후 `GET /api/operation-areas/{areaId}/snapshot` 조회
3. 이후 WebSocket 이벤트 수신 시 화면 일부 갱신
4. WebSocket 재연결 시 다시 snapshot 조회

재연결 후 누락 이벤트를 복구하는 별도 sequence 저장은 아직 구현하지 않았다. 시연용 기준으로 snapshot 재조회가 상태 보정 역할을 한다.
