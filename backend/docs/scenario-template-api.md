# 시나리오 템플릿 API

시나리오 실행 설정을 브라우저 로컬 저장소 대신 PostgreSQL에 저장한다.

## API

| Method | URL | 설명 |
|---|---|---|
| POST | `/api/scenario-templates` | 템플릿 저장 |
| GET | `/api/scenario-templates` | 템플릿 목록 조회 |
| GET | `/api/scenario-templates/{templateId}` | 템플릿 상세 조회 |
| PUT | `/api/scenario-templates/{templateId}` | 템플릿 수정 |
| DELETE | `/api/scenario-templates/{templateId}` | 템플릿 삭제 |

목록은 `?scenarioType=JAMMING` 또는 `?scenarioType=SPOOFING`으로 필터링할 수 있다.

## 저장 요청 예시

```json
{
  "name": "강한 GNSS 재밍",
  "description": "발표용 재밍 설정",
  "scenarioType": "JAMMING",
  "config": {
    "targetSystem": "GNSS",
    "intensity": "HIGH"
  },
  "interferenceZone": {
    "center": {
      "latitude": 37.5665,
      "longitude": 126.978,
      "altitude": 100
    },
    "radiusMeters": 500
  },
  "createdBy": "admin"
}
```

저장 응답의 `data.id`가 템플릿 ID다. 저장된 `config`와 `interferenceZone`은
시나리오 실행 시 `POST /api/scenario-runs` 요청에 사용할 수 있다.

같은 이름의 템플릿을 다시 저장하면 HTTP 409와
`SCENARIO_TEMPLATE_NAME_DUPLICATED` 오류를 반환한다.
