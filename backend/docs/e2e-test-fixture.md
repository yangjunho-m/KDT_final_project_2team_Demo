# WebSocket / Scenario E2E 테스트 Fixture

## 목적

프론트엔드가 WebSocket 이벤트 payload, scenario run create/tick/stop 흐름, normalizer를 안정적으로 검증할 수 있도록 백엔드가 전용 테스트 데이터를 서버 시작 시 자동 보장한다.

## 테스트 전용 데이터

| 항목 | 값 |
|---|---|
| test areaId | `AREA-E2E-001` |
| test area name | `E2E 테스트 전용 작전지 - WebSocket/Scenario` |
| test droneId | `DRN-E2E-001` |
| test drone name | `E2E 테스트 전용 드론` |
| 출발/current 좌표 | `37.5665, 126.9780, altitude 120` |
| 이동 목표 좌표 | `37.5692, 126.9810, altitude 130` |
| scenario-ready 여부 | ready |

fixture 확인 API:

```text
GET /api/system/e2e-fixture
```

## 허용 테스트 동작

| 동작 | 허용 여부 | 비고 |
|---|---|---|
| JAMMING scenario run create | 허용 | `POST /api/scenario-runs` |
| SPOOFING scenario run create | 허용 | `POST /api/scenario-runs` |
| 수동 tick | 허용 | 최대 5회까지 허용. 자동 scheduler도 동작함 |
| stop | 허용 | `POST /api/scenario-runs/{runId}/stop` |
| STOPPING -> STOPPED 전환 tick | 허용 | scheduler가 자동 처리하거나 수동 tick 1회 호출 |
| drone movement-target 변경 | 비권장 | fixture에 이미 movement target 있음 |
| area/drone 삭제 | 금지 | fixture는 유지 |

## 테스트 종료 조건

- 모든 scenario run 상태가 `STOPPED`
- `GET /api/scenario-runs/active?areaId=AREA-E2E-001` 결과가 빈 배열
- `AREA-E2E-001`, `DRN-E2E-001`은 그대로 유지

## Scheduler 정책

백엔드는 `RUNNING`, `STOPPING` 상태의 scenario run을 background scheduler가 주기적으로 tick한다.

기본 설정:

```env
SCENARIO_TICK_SCHEDULER_ENABLED=true
SCENARIO_TICK_INTERVAL_SECONDS=1.0
```

동작:

- `RUNNING` run은 1초마다 `advance_scenario_run_tick` 처리
- `STOPPING` run은 다음 tick에서 `STOPPED`로 전환
- 발생 이벤트는 WebSocket으로 broadcast

다중 인스턴스 중복 실행 방지:

- PostgreSQL 환경에서는 `pg_try_advisory_lock`으로 scheduler lock을 획득한 인스턴스만 tick 수행
- lock을 얻지 못한 인스턴스는 해당 주기 tick을 건너뜀
- 로컬 SQLite 테스트 환경에서는 DB advisory lock 없이 단일 프로세스 기준으로 동작

서버 재시작 복구 정책:

- DB에 남아 있는 `RUNNING`, `STOPPING` run은 서버 재시작 후 scheduler가 다시 조회한다.
- `RUNNING`은 다음 주기부터 tick 재개
- `STOPPING`은 다음 주기에 `STOPPED`로 마무리
- 이미 `STOPPED`, `COMPLETED`, `FAILED`인 run은 자동 tick 대상이 아니다.

## 프론트 전달값

```text
test areaId: AREA-E2E-001
test droneId: DRN-E2E-001
수동 tick 허용 여부: 허용, 최대 5회. 단 자동 scheduler도 동작
JAMMING/SPOOFING create 허용 여부: 둘 다 허용
테스트 가능 시간대: 평일 09:00-18:00 KST, 발표/배포 작업 시간은 사전 공유
```

## health DEGRADED 원인

현재 `GET /api/system/health`는 실제 DB/Storage/Inference를 점검하는 health check가 아니라 시연용 mock 응답이다.

따라서 `database`, `storage`, `inferenceAgent`가 `DEGRADED`로 보이는 것은 현재 구현상 고정 샘플 상태이며, 실제 장애를 의미하지 않는다.

