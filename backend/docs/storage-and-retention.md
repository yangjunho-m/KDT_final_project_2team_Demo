# 저장소와 보존 정책 초안

## PostgreSQL

- 현재 상태: UPSERT
- 이력: 30일 검토
- 보고서: 기본 90일, pinned 보고서는 장기 보존 제안

## MinIO

- `datasets`: 원본 데이터셋, 자동 삭제 안 함
- `reports`: 보고서 첨부파일, 보고서 보존 정책과 동일
- `assets`: 드론 이미지 자산
- `temporary`: 24시간 lifecycle 권장

## 삭제 정책

삭제 작업은 Scheduler가 수행하고, cleanup 실패는 이벤트 또는 로그에 남깁니다.
