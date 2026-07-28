# GitHub Actions CI/CD

## Goal

`main` 또는 `develop` 브랜치에 backend 변경사항이 push되면 GitHub Actions가 Oracle Cloud 서버에 접속해 FastAPI 백엔드를 자동 배포한다.

## Pipeline

```text
GitHub push
  -> GitHub Actions
  -> Python dependency install
  -> python -m compileall app
  -> backend folder upload by SCP
  -> SSH into Oracle Cloud
  -> docker compose build backend
  -> docker compose up -d postgres minio backend
  -> /api/system/health check
```

## Files

```text
.github/workflows/deploy.yml
backend/deploy/backend-deploy.sh
```

## Required GitHub Secrets

Repository Settings -> Secrets and variables -> Actions -> Repository secrets 에 아래 값을 등록한다.

```text
OCI_HOST=example.com
OCI_USER=ubuntu
OCI_SSH_KEY=<private ssh key content>
OCI_SSH_PORT=22
```

`OCI_SSH_KEY`에는 서버 접속에 사용하는 개인키 전체 내용을 넣는다.

예:

```text
<GitHub Secret에 등록한 전체 SSH 개인 키 내용>
```

## Server Requirements

서버에는 아래가 준비되어 있어야 한다.

```text
~/backend/.env
Docker
Docker Compose plugin
sudo docker compose 권한
```

서버의 `.env`는 GitHub에 올리지 않고 서버에만 유지한다.

현재 권장값:

```env
DATABASE_URL=postgresql+psycopg://app_user:change_me@postgres:5432/drone_platform
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=admin
MINIO_SECRET_KEY=change_me
MINIO_BUCKET_DATASETS=datasets
MINIO_BUCKET_REPORTS=reports
MINIO_BUCKET_ASSETS=assets
SEED_ADMIN=true
SEED_DEMO_DATA=false
SEED_E2E_FIXTURE=false
```

## Manual Run

GitHub Actions 화면에서 `Backend CI/CD` workflow를 선택한 뒤 `Run workflow`로 수동 실행할 수 있다.

## Check

배포 후 서버에서 확인:

```bash
curl http://127.0.0.1:8000/api/system/health
```

정상 목표:

```text
api: OK
database: OK
storage: OK
inferenceAgent: DEGRADED
```

`inferenceAgent`는 AI 서버 미연결 상태면 `DEGRADED`가 정상이다.
