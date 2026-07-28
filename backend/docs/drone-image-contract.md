# 드론 이미지 업로드 계약

## 목적

통합 모니터링 화면에서 사용하는 드론 지도용 이미지와 카드용 이미지를 업로드한다.

이미지를 업로드하지 않았거나 로드에 실패하면 프론트엔드는 기본 마커와 기본 카드 이미지를 사용한다.

## 저장 방식

- 저장소: MinIO
- 버킷: `assets`
- 객체 경로:
  - 지도용 이미지: `drones/{droneId}/icon/{uuid}.{ext}`
  - 카드용 이미지: `drones/{droneId}/card/{uuid}.{ext}`

## 허용 파일

| 항목 | 값 |
|---|---|
| 확장자 | `.png`, `.jpg`, `.jpeg`, `.svg` |
| 최대 크기 | `MAX_UPLOAD_SIZE_MB` 환경변수 기준 |
| 전송 방식 | `multipart/form-data` |
| 파일 필드명 | `file` |

## API 목록

| 기능 | Method | Path |
|---|---|---|
| 지도용 이미지 업로드 | POST | `/api/drones/{droneId}/images/icon` |
| 카드용 이미지 업로드 | POST | `/api/drones/{droneId}/images/card` |
| 이미지 다운로드 | GET | `/api/drones/{droneId}/images/{imageType}/download?objectKey={objectKey}` |
| 이미지 삭제 | DELETE | `/api/drones/{droneId}/images/{imageType}` |

`imageType`은 `icon` 또는 `card`만 허용한다.

## 업로드 요청 예시

```bash
curl -X POST http://localhost:8000/api/drones/DRN-001/images/icon \
  -F "file=@drone-icon.png"
```

## 업로드 응답 예시

```json
{
  "success": true,
  "data": {
    "drone": {
      "id": "DRN-001",
      "iconImageUrl": "/api/drones/DRN-001/images/icon/download?objectKey=drones%2FDRN-001%2Ficon%2F..."
    },
    "image": {
      "type": "icon",
      "objectKey": "drones/DRN-001/icon/uuid.png",
      "url": "/api/drones/DRN-001/images/icon/download?objectKey=drones%2FDRN-001%2Ficon%2Fuuid.png"
    }
  },
  "message": "드론 이미지가 업로드되었습니다."
}
```

## 프론트 반영 기준

- 지도 마커 이미지는 `drone.iconImageUrl`을 사용한다.
- 드론 카드 이미지는 `drone.cardImageUrl`을 사용한다.
- 값이 `null`이거나 이미지 로드가 실패하면 프론트 기본 이미지를 사용한다.
- 이미지 교체는 같은 업로드 API를 다시 호출하면 된다.
- 삭제 후 응답의 해당 이미지 URL은 `null`이 된다.

## 오류 코드

| 코드 | 의미 |
|---|---|
| `DRONE_NOT_FOUND` | 드론을 찾을 수 없음 |
| `UNSUPPORTED_DRONE_IMAGE_EXTENSION` | 허용되지 않은 이미지 확장자 |
| `DRONE_IMAGE_TOO_LARGE` | 이미지 용량 초과 |
| `INVALID_DRONE_IMAGE_REFERENCE` | 이미지 참조 경로가 올바르지 않음 |
| `DRONE_IMAGE_OBJECT_NOT_FOUND` | MinIO에서 이미지 객체를 찾을 수 없음 |
