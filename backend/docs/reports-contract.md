# 보고서 API 계약

`/api/reports`는 로그인 후 보고서 화면에서 사용하는 API다. 새 요구사항에 맞춰 `operationAreaId`, `content`, `reportPosition`을 지원한다.

## 목록 조회

```text
GET /api/reports?operationAreaId=AREA-001&page=1&size=20
```

Query:

```text
operationAreaId: 작전지역 ID
page: 기본값 1
size: 기본값 20, 최대 100
status: NEW | CONFIRMED | CLOSED
important: true | false
search: 제목 또는 내용 검색어
```

## 상세 조회

```text
GET /api/reports/{reportId}
```

응답 주요 필드:

```json
{
  "id": "RPT-001",
  "operationAreaId": "AREA-001",
  "title": "이동 표적 발견",
  "summary": "작전지역 북동쪽에서 이동 표적이 감지되었습니다.",
  "content": "작전지역 북동쪽에서 이동 표적이 감지되었습니다.",
  "important": true,
  "status": "NEW",
  "createdBy": "USR-001",
  "droneId": "DRN-001",
  "targetId": "TGT-001",
  "scenarioId": null,
  "reportPosition": {
    "latitude": 37.568,
    "longitude": 126.9811,
    "altitude": 0
  },
  "attachments": []
}
```

`summary`와 `position`은 기존 프론트 호환용으로 계속 내려간다. 새 화면에서는 `content`, `reportPosition`을 사용하면 된다.

## 생성

```text
POST /api/reports
```

요청:

```json
{
  "operationAreaId": "AREA-001",
  "title": "테스트 보고",
  "content": "보고 API 테스트",
  "important": true,
  "createdBy": "USR-001",
  "clientRequestId": "demo-request-001",
  "reportPosition": {
    "latitude": 37.568,
    "longitude": 126.9811,
    "altitude": 0
  }
}
```

확인용 curl:

```bash
curl -X POST http://localhost:8000/api/reports \
  -H "Content-Type: application/json" \
  -d "{\"operationAreaId\":\"AREA-001\",\"title\":\"테스트 보고\",\"content\":\"보고 API 테스트\",\"createdBy\":\"USR-001\",\"important\":true}"
```

## 상태 변경

```text
PATCH /api/reports/{reportId}/status
```

```json
{
  "status": "CONFIRMED"
}
```

## 중요 표시 변경

```text
PATCH /api/reports/{reportId}/important
```

```json
{
  "important": true
}
```

## 첨부 업로드

```text
POST /api/reports/{reportId}/attachments
Content-Type: multipart/form-data
```

```bash
curl -X POST http://localhost:8000/api/reports/RPT-001/attachments \
  -F "file=@target-preview.jpg"
```

백엔드는 파일을 MinIO의 `reports` 버킷에 저장하고 DB에는 `objectKey`를 저장한다.

## 첨부 다운로드

```text
GET /api/reports/{reportId}/attachments/{attachmentId}/download?type=download
```

프론트는 이미지 표시 시 이 백엔드 URL을 사용하면 된다. MinIO 포트를 브라우저에 직접 열 필요는 없다.
