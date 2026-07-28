# 성능 검토 초안

## 현재 한계

서버가 1 OCPU / 1GB RAM 수준이면 FastAPI, PostgreSQL/PostGIS, MinIO, Nginx, Scheduler, WebSocket을 모두 한 서버에 올릴 때 메모리가 가장 큰 병목입니다.

## 권장 초기값

- Uvicorn worker: 1
- DB pool size: 3 이하
- WebSocket 연결: 시연 인원 기준 제한
- 위치 이력 저장: 매초 전체 저장 금지
- MinIO 대용량 전송: presigned URL 사용

## 분리 우선순위

1. Cross-view 모델은 VM에서 실행하지 않음
2. MinIO를 외부 또는 별도 VM으로 분리
3. PostgreSQL/PostGIS 분리
4. Scheduler 별도 프로세스 분리

## 실측 필요

실제 VM에서 idle, API 요청 중, 파일 전송 중, WebSocket 연결 중 메모리와 CPU를 측정해야 합니다.
