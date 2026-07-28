# 배포 설계 초안

## 전제

- Oracle Cloud Ubuntu VM
- Docker Compose
- FastAPI
- PostgreSQL/PostGIS
- MinIO
- Nginx

## 포트

- 외부 공개: `80`, `443`
- 내부 전용: `5432`, `9000`, `9001`
- 백엔드 내부: `8000`

## Nginx

- `/api` → FastAPI
- `/ws` → FastAPI WebSocket
- 프론트 정적 파일 제공 여부는 프론트 배포 방식 확정 후 결정합니다.

## 배포

현재는 Git pull 후 수동 재시작을 전제로 하되, 추후 CI/CD와 health check 기반 restart를 검토합니다.
