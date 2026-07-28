# backend_local 로컬 실행판

이 폴더는 별도 서버 인프라 없이 로컬 PC에서 실행하는 FastAPI 백엔드입니다.
데이터베이스는 SQLite, 파일 저장소는 로컬 디렉터리만 사용합니다.

## 주요 파일

- `main.py`: FastAPI 실행 진입점
- `app/`: API와 서비스 코드
- `requirements.txt`: Python 의존성
- `run_local.cmd`: Windows 로컬 실행 스크립트
- `.env.example`: 로컬 환경변수 예시
- `scripts/`: 데이터 인덱스 생성 도구
- `tests/`: 백엔드 테스트

`local-data/`, `local-storage/`, `storage/`는 실행 중 만들어지는 데이터이므로
Git 추적 대상에서 제외합니다.

## 로컬 저장 구조

- DB: `local-data/drone_platform.db`
- 데이터셋과 이미지: `local-storage/datasets`
- 업로드 이미지: `local-storage/assets`
- 보고서 첨부 파일: `local-storage/reports`

데이터셋은 다음과 같은 구조로 넣습니다.

```text
local-storage/datasets/
  jamming-route/
    metadata.csv
    ROUTE_A/
  spoofing-route/
    metadata.csv
    ROUTE_B/
  songdo-route/
    metadata_songdo.csv
```

## 처음 실행

```bat
cd C:\Users\사용자명\project\KDT_final_project_2team_Demo\backend_local
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
run_local.cmd
```

`run_local.cmd`는 `.env`가 없어도 SQLite와 로컬 파일 저장소 설정으로 실행됩니다.
개인별 설정이 필요하면 `.env.example`을 `.env`로 복사한 다음 필요한 값만 수정합니다.

## 실행 확인

```bat
curl http://127.0.0.1:8000/api/system/health
curl http://127.0.0.1:8000/api/operation-areas/AREA-DATASET-001/snapshot
curl http://127.0.0.1:8000/api/drone-view/routes
```
