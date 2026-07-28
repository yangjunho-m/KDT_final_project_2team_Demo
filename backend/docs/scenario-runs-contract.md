# 시나리오 실행 API 계약

## 목적

프론트 추가 요구사항에 맞춰 시나리오를 드론 직접 선택이 아니라 적진지 단위로 실행한다.

기존 `/api/scenarios`는 유지하고, 새 화면 연동은 `/api/scenario-runs`를 우선 사용한다.

## API 목록

| 기능 | Method | Path |
|---|---|---|
| 실행 시작 | POST | `/api/scenario-runs` |
| 활성 실행 조회 | GET | `/api/scenario-runs/active?areaId=AREA-001` |
| 단일 실행 조회 | GET | `/api/scenario-runs/{runId}` |
| 실행 중지 | POST | `/api/scenario-runs/{runId}/stop` |
| 위치 갱신 tick | POST | `/api/scenario-runs/{runId}/tick` |

## 재밍 실행 요청

```json
{
  "areaId": "AREA-001",
  "scenarioType": "JAMMING",
  "config": {
    "type": "JAMMING",
    "targetSystem": "BOTH",
    "intensity": "HIGH"
  },
  "interferenceZone": {
    "center": {
      "latitude": 37.56972,
      "longitude": 126.97664
    },
    "radiusMeters": 500
  }
}
```

## 스푸핑 실행 요청

```json
{
  "areaId": "AREA-001",
  "scenarioType": "SPOOFING",
  "config": {
    "type": "SPOOFING",
    "severity": "MEDIUM",
    "spoofedPosition": {
      "latitude": 37.5721,
      "longitude": 126.9812
    }
  },
  "interferenceZone": {
    "center": {
      "latitude": 37.56972,
      "longitude": 126.97664
    },
    "radiusMeters": 500
  }
}
```

## 응답 핵심

```json
{
  "runId": "RUN-20260703-001",
  "areaId": "AREA-001",
  "scenarioType": "JAMMING",
  "status": "RUNNING",
  "participatingDrones": ["DRN-001"],
  "excludedDrones": [
    {
      "droneId": "DRN-002",
      "reason": "ROUTE_NOT_CONFIGURED"
    }
  ],
  "droneRuntimes": []
}
```

## 현재 구현 범위

- 같은 적진지의 중복 실행 방지
- 드론 0대 실행 거부
- 이동 목표가 있는 드론만 실행 참여
- 이동 목표가 없는 드론은 `excludedDrones`에 포함
- 교란 구역 진입 여부 초기 판정
- 드론별 런타임 상태 생성
- 실행 중지 요청 시 `STOPPING` 처리
- `STOPPING` 상태에서 다음 tick 호출 시 `STOPPED` 처리
- WebSocket `SCENARIO_STARTED`, `SCENARIO_STOPPING`, `SCENARIO_STOPPED` 이벤트 발행
- tick 호출 시 드론 위치를 이동 목표 방향으로 갱신
- tick 호출 시 `DRONE_POSITION_UPDATED` 이벤트 발행
- 교란 구역 진입 시 `DRONE_ENTERED_ZONE` 이벤트 발행
- 재밍 구역 진입 시 `JAMMING_DETECTED` 이벤트 발행
- 스푸핑 구역 진입 시 `SPOOFING_DETECTED` 이벤트 발행
- 교란 감지 시 `NAVIGATION_STATUS_CHANGED` 이벤트 발행
- Cross-view 상태 전환 시 `CROSS_VIEW_PREPARING`, `CROSS_VIEW_STARTED`, `CROSS_VIEW_CORRECTED` 이벤트 발행
- 교란 구역 이탈 시 `DRONE_EXITED_ZONE` 이벤트 발행

## 위치 갱신 tick

```text
POST /api/scenario-runs/{runId}/tick
```

응답:

```json
{
  "success": true,
  "data": {
    "run": {},
    "events": [
      {
        "eventType": "DRONE_POSITION_UPDATED",
        "runId": "RUN-20260703-001",
        "areaId": "AREA-001",
        "droneId": "DRN-001",
        "position": {
          "latitude": 37.5689,
          "longitude": 126.9752,
          "altitude": 120
        },
        "timestamp": "2026-07-03T00:00:00Z"
      }
    ]
  },
  "message": "시나리오 드론 위치가 갱신되었습니다."
}
```

프론트는 수동 검증이 필요할 때 이 API를 호출하면 드론 이동과 구역 진입/이탈 이벤트를 받을 수 있다.

## 백엔드 자동 tick scheduler

현재는 백엔드 background scheduler가 `RUNNING`, `STOPPING` 상태의 scenario run을 주기적으로 tick한다.

- 기본 주기: 1초
- 설정: `SCENARIO_TICK_SCHEDULER_ENABLED=true`, `SCENARIO_TICK_INTERVAL_SECONDS=1.0`
- `RUNNING` run: 드론 위치와 runtime 상태 갱신
- `STOPPING` run: 다음 tick에서 `STOPPED` 처리
- 발생 이벤트는 WebSocket으로 broadcast
- PostgreSQL에서는 `pg_try_advisory_lock`으로 다중 인스턴스 중복 tick을 방지
- 서버 재시작 후 DB에 남은 `RUNNING`, `STOPPING` run은 scheduler가 재개/정리

## 아직 다음 단계로 남은 것

- 시나리오 자동 완료 조건
