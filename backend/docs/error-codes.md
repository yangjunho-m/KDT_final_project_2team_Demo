# 오류 코드 초안

| Code | HTTP | 메시지 |
|---|---:|---|
| `VALIDATION_ERROR` | 422 | 요청 값이 올바르지 않습니다. |
| `DRONE_NOT_FOUND` | 404 | 드론을 찾을 수 없습니다. |
| `REPORT_NOT_FOUND` | 404 | 보고서를 찾을 수 없습니다. |
| `ATTACHMENT_NOT_FOUND` | 404 | 첨부파일을 찾을 수 없습니다. |
| `SAVED_COORDINATE_NOT_FOUND` | 404 | 저장 좌표를 찾을 수 없습니다. |
| `MODEL_UNAVAILABLE` | 503 | Cross-view 모델을 사용할 수 없습니다. |
| `LOW_CONFIDENCE` | 409 | 모델 confidence가 기준보다 낮습니다. |
| `DATASET_NOT_FOUND` | 404 | 데이터셋을 찾을 수 없습니다. |
| `FRAME_NOT_FOUND` | 404 | 이미지 프레임을 찾을 수 없습니다. |
| `DATABASE_UNAVAILABLE` | 503 | DB에 연결할 수 없습니다. |
| `STORAGE_UNAVAILABLE` | 503 | 스토리지에 연결할 수 없습니다. |
