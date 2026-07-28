# V-World 데이터셋 설계 초안

## 저장 구조

```text
datasets/route-001/
├─ manifest.json
├─ frames/
├─ telemetry.jsonl
├─ route.geojson
└─ preview.jpg
```

## 조회 원칙

- 전체 프레임을 한 번에 전송하지 않습니다.
- 프레임은 `datasetId`, `frameIndex`, `timeMs` 기준으로 조회합니다.
- 이미지는 MinIO object key를 저장하고 presigned URL로 내려줍니다.
- URL 만료시간은 기본 15분을 제안합니다.
- 누락 프레임은 `FRAME_NOT_FOUND`로 응답합니다.
