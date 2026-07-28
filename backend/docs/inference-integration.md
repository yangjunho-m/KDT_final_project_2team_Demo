# Inference API 계약

## 현재 구현 범위

현재 백엔드는 실제 AI 모델을 호출하지 않는다. 시연용으로 `modelMode=DEMO` 분석 결과를 즉시 생성한다.

프론트는 이 API로 다음 흐름을 시연할 수 있다.

```text
분석 요청
→ COMPLETED 결과 즉시 반환
→ estimatedPosition, confidence 표시
→ createTarget=true이면 표적 자동 생성
→ WebSocket inference.completed 이벤트 수신
```

## API 목록

| 기능 | Method | Path |
|---|---|---|
| 분석 작업 목록 | GET | `/api/inference/jobs?operationAreaId=AREA-001` |
| 시연용 분석 실행 | POST | `/api/inference/jobs` |
| 분석 작업 상세 | GET | `/api/inference/jobs/{jobId}` |
| 분석 결과 조회 | GET | `/api/inference/jobs/{jobId}/result` |

## 분석 실행 요청 예시

```json
{
  "operationAreaId": "AREA-001",
  "droneId": "DRN-001",
  "requestedBy": "USR-001",
  "sourceType": "DEMO_FRAME",
  "sourceReference": "demo://frame/001",
  "createTarget": true
}
```

`droneId`는 선택값이다. 드론이 없으면 적진지 중심 근처 좌표를 시연 결과로 생성한다.

## 분석 결과 응답 예시

```json
{
  "success": true,
  "data": {
    "jobId": "INF-001",
    "operationAreaId": "AREA-001",
    "droneId": "DRN-001",
    "status": "COMPLETED",
    "estimatedPosition": {
      "latitude": 37.56685,
      "longitude": 126.97835,
      "altitude": 100
    },
    "confidence": 0.86,
    "modelVersion": "demo-inference-v1",
    "targetId": "TGT-001",
    "reportId": null,
    "errorCode": null,
    "completedAt": "2026-07-02T00:00:00Z"
  },
  "message": "시연용 AI 분석이 완료되었습니다."
}
```

## WebSocket 이벤트

분석이 완료되면 다음 이벤트가 발행된다.

```text
inference.completed
```

`createTarget=true`로 표적이 생성되면 다음 이벤트도 함께 발행된다.

```text
target.created
```

---

# Local Inference Agent 연동 설계 초안

## 방식

Cross-view 모델은 Oracle VM에서 실행하지 않고 시연용 노트북 또는 로컬 Agent가 REST polling으로 작업을 가져갑니다.

## 흐름

```text
백엔드 inference job 생성
→ Agent heartbeat
→ Agent 작업 조회
→ Agent claim
→ 모델 실행
→ 성공 또는 실패 결과 제출
→ 백엔드 결과 저장 및 이벤트 전송
```

## 원칙

- 모델 실패 시 가짜 좌표를 성공으로 저장하지 않습니다.
- Demo Adapter 결과는 `modelMode=DEMO`로 구분합니다.
- `LOW_CONFIDENCE` 결과는 현재 위치를 자동으로 덮어쓰지 않습니다.
- 여러 드론이 동시에 영향을 받으면 순차 처리합니다.
