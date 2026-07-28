# 백엔드 아키텍처

## 구성

```text
브라우저 프론트
↕ REST / WebSocket
FastAPI 백엔드
↕
PostgreSQL/PostGIS
MinIO
Local Inference Agent
Scheduler
```

## FastAPI 내부 책임

- `api`: 요청과 응답 처리
- `schemas`: 프론트와 공유할 요청·응답 타입
- `services`: 비즈니스 로직
- `repositories`: DB 접근
- `simulation`: 시뮬레이션 tick과 상태 계산
- `websocket`: 연결 관리와 이벤트 broadcast
- `storage`: MinIO object key와 presigned URL 관리
- `workers`: Scheduler, cleanup, inference timeout 처리

## 트랜잭션 경계

보고서 생성, inference 결과 저장, 시나리오 세션 종료처럼 여러 테이블을 함께 변경하는 작업은 service 단위에서 트랜잭션을 시작하고 repository는 쿼리만 수행합니다.

## 오류 처리

공통 실패 응답은 `success=false`, `error.code`, `error.message`, `error.details`, `error.timestamp` 형식을 사용합니다.
