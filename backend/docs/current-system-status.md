# 현재 서버 구축 현황

## 상태

현재 저장소 기준으로 확인된 백엔드 코드는 FastAPI 초기 골격입니다. Oracle Cloud VM, Docker, MinIO, PostgreSQL/PostGIS, Nginx의 실제 운영 서버 상태는 이 로컬 저장소만으로 확인할 수 없습니다.

## 확인 필요 항목

- Oracle VM 운영체제와 리소스
- 실행 중인 Docker 컨테이너 목록
- FastAPI 실행 경로와 현재 API 목록
- PostgreSQL/PostGIS 버전과 테이블 목록
- MinIO 버킷 목록과 lifecycle 정책
- Nginx reverse proxy, HTTPS, WebSocket proxy 설정
- 외부 공개 포트와 내부 전용 포트

## 재사용 후보

- FastAPI 앱 구조
- PostgreSQL/PostGIS
- MinIO object storage
- Nginx reverse proxy
- Docker Compose 기반 실행 방식

## 수정 필요 후보

- 환경변수 이름 통일
- `/api` API prefix 적용
- `/ws/realtime` WebSocket proxy 설정
- DB migration 도입
- MinIO presigned URL API 구현
