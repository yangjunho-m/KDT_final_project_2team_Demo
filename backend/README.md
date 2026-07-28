# 백엔드 서버용

FastAPI 기반 서버용 백엔드이다. 실제 오라클 서버에서 배포할때 사용한다.

## 실행 방법

로컬 Python 실행:

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Docker Compose 실행:

```bash
cd backend
copy .env.example .env
docker compose up -d --build
```

Docker 내부에서는 PostgreSQL과 MinIO를 서비스명으로 접근한다.

```text
DATABASE_URL=postgresql+psycopg://app_user:change_me@postgres:5432/drone_platform
MINIO_ENDPOINT=minio:9000
```

## 확인 URL

- Swagger: `http://example.com:8000/docs`
- Health: `http://example.com:8000/api/system/health`
- 로그인: `POST http://example.com:8000/api/auth/login`
- 초기화면 데이터: `GET http://example.com:8000/api/dashboard/main`
- 작전지역 목록: `GET http://example.com:8000/api/operation-areas`
- 대시보드 스냅샷: `GET http://example.com:8000/api/operation-areas/AREA-001/snapshot`
- 보고서 목록: `GET http://example.com:8000/api/reports?operationAreaId=AREA-001`

## 시연 로그인

서버 시작 시 PostgreSQL에 시연 관리자 계정을 자동 생성한다.

```text
id: admin
password: admin
```

로그인 성공 응답에는 JWT 토큰과 프론트 이동 경로가 포함된다.

```json
{
  "success": true,
  "data": {
    "accessToken": "JWT_TOKEN",
    "tokenType": "bearer",
    "redirectPath": "/reports"
  },
  "message": "요청이 성공했습니다."
}
```

## 주요 API

초기화면 API:

- 지휘보고 메인 초기 데이터: `GET /api/dashboard/main`

작전지역 API:

- 목록: `GET /api/operation-areas`
- 유사 적진지 조회: `GET /api/operation-areas/nearby?latitude=37.5665&longitude=126.978&distanceMeters=30`
- 생성: `POST /api/operation-areas`
- 상세: `GET /api/operation-areas/{areaId}`
- 수정: `PATCH /api/operation-areas/{areaId}`
- 삭제: `DELETE /api/operation-areas/{areaId}`
- 대시보드 스냅샷: `GET /api/operation-areas/{areaId}/snapshot`
- 드론 목록: `GET /api/operation-areas/{areaId}/drones`
- 드론 등록: `POST /api/operation-areas/{areaId}/drones`
- 드론 이동 목표: `POST /api/drones/{droneId}/movement-target`
- 드론 지도 이미지 업로드: `POST /api/drones/{droneId}/images/icon`
- 드론 카드 이미지 업로드: `POST /api/drones/{droneId}/images/card`
- 드론 이미지 삭제: `DELETE /api/drones/{droneId}/images/{icon|card}`
- 드론 배정 해제: `DELETE /api/operation-areas/{areaId}/drones/{droneId}`
- 표적 목록: `GET /api/operation-areas/{areaId}/targets`
- 표적 생성: `POST /api/operation-areas/{areaId}/targets`
- 표적 상세: `GET /api/targets/{targetId}`
- 시나리오 가능 드론: `GET /api/operation-areas/{areaId}/scenario-ready-drones`
- 시나리오 미리보기: `POST /api/scenarios/preview`
- 시나리오 적용: `POST /api/scenarios`
- 활성 시나리오 목록: `GET /api/scenarios/active?operationAreaId=AREA-001`
- 시나리오 종료: `POST /api/scenarios/{scenarioId}/end`
- 적진지 단위 시나리오 실행: `POST /api/scenario-runs`
- 적진지 단위 활성 실행 조회: `GET /api/scenario-runs/active?areaId=AREA-001`
- 적진지 단위 시나리오 중지: `POST /api/scenario-runs/{runId}/stop`
- 시연용 AI 분석 실행: `POST /api/inference/jobs`
- AI 분석 결과 조회: `GET /api/inference/jobs/{jobId}/result`

보고서 API:

- 목록: `GET /api/reports?operationAreaId=AREA-001`
- 상세: `GET /api/reports/{reportId}`
- 생성: `POST /api/reports`
- 상태 변경: `PATCH /api/reports/{reportId}/status`
- 중요 표시 변경: `PATCH /api/reports/{reportId}/important`
- 첨부 업로드: `POST /api/reports/{reportId}/attachments`
- 첨부 다운로드: `GET /api/reports/{reportId}/attachments/{attachmentId}/download`

프론트 전달용 최종 요약은 `docs/프론트엔드_API_연동_명세서.md`를 참고한다. WebSocket/Scenario E2E 테스트 fixture와 자동 tick 정책은 `docs/e2e-test-fixture.md`를 참고한다. 프로젝트 데이터와 DB 컬럼 정의는 `docs/데이터정의서_및_명세서.xlsx`를 참고한다. 기능별 상세 계약은 `docs/operation-area-contract.md`, `docs/reports-contract.md`, `docs/scenario-contract.md`, `docs/websocket-events.md`를 참고한다.

## 드론 이미지 업로드

드론 이미지는 MinIO의 `assets` 버킷에 저장하고, 드론 응답의 `iconImageUrl` 또는 `cardImageUrl`에 백엔드 다운로드 URL을 반환한다.

```bash
curl -X POST http://localhost:8000/api/drones/DRN-001/images/icon \
  -F "file=@drone-icon.png"
```

허용 확장자는 PNG, JPG, SVG다. 이미지를 삭제하면 해당 URL은 `null`로 초기화되며 프론트는 기본 마커 또는 기본 카드 이미지를 표시하면 된다.
