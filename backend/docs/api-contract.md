# REST API 계약 초안

## 공통 응답

```json
{
  "success": true,
  "data": {},
  "message": "요청이 성공했습니다."
}
```

## 주요 API

| 기능 | Method | Path | 인증 |
|---|---|---|---|
| 로그인 | POST | `/api/auth/login` | 없음 |
| 현재 사용자 | GET | `/api/auth/me` | 필요 |
| 보고 목록 | GET | `/api/reports` | 필요 |
| 보고 상세 | GET | `/api/reports/{reportId}` | 필요 |
| 보고 상태 변경 | PATCH | `/api/reports/{reportId}/status` | 필요 |
| 중요 표시 | PATCH | `/api/reports/{reportId}/important` | 필요 |
| 첨부 URL | GET | `/api/reports/{reportId}/attachments/{attachmentId}/url` | 필요 |
| 저장 좌표 목록 | GET | `/api/saved-coordinates` | 필요 |
| 드론 목록 | GET | `/api/drones` | 필요 |
| 드론 지도 이미지 업로드 | POST | `/api/drones/{droneId}/images/icon` | 필요 |
| 드론 카드 이미지 업로드 | POST | `/api/drones/{droneId}/images/card` | 필요 |
| 드론 이미지 삭제 | DELETE | `/api/drones/{droneId}/images/{imageType}` | 필요 |
| 통합 snapshot | GET | `/api/operation/snapshot` | 필요 |
| 시나리오 가능 드론 | GET | `/api/operation-areas/{areaId}/scenario-ready-drones` | 필요 |
| 시나리오 미리보기 | POST | `/api/scenarios/preview` | 필요 |
| 시나리오 적용 | POST | `/api/scenarios` | 필요 |
| 활성 시나리오 | GET | `/api/scenarios/active` | 필요 |
| 시나리오 종료 | POST | `/api/scenarios/{scenarioId}/end` | 필요 |
| inference 생성 | POST | `/api/inference/jobs` | 필요 |
| inference 결과 | GET | `/api/inference/jobs/{jobId}/result` | 필요 |
| 시스템 상태 | GET | `/api/system/health` | 필요 |

현재 코드는 위 계약을 mock 응답으로 제공합니다. 최종 필드명은 프론트 검토 후 고정합니다.
