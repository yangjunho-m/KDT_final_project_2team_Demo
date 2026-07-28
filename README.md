# KDT 2026 Acorn 7기 2팀 Final Project

드론 감시·정찰 데이터를 실시간으로 확인하고, 재밍·스푸핑 상황을 시뮬레이션하는 관제 서비스입니다.

## 배포된 서비스 확인

프로젝트는 서버에 배포되어 있으므로 별도 설치 없이 웹 브라우저에서 먼저 확인할 수 있습니다.

> 운영 서비스 주소

```text
http://140.245.92.139:8000/docs     fastAPI
http://140.245.92.139:9001/login    MinIO
```

## 로컬에서 실행하기

서버에 접속할 수 없거나 코드를 직접 실행하려면 `frontend` 와 `backend_local` 를 사용합니다.

### 1. 프로젝트 내려받기

```bat
git clone https://github.com/yangjunho-m/KDT_final_project_2team_Demo.git
cd KDT_final_project_2team_Demo
```

ZIP 파일로 내려받았다면 압축을 푼 뒤 해당 폴더에서 터미널을 실행해도 됩니다.

### 2. 환경설정

.env.example 수정
.backend_local/local-storage 에 이미지 넣기

### 3. 로컬 백엔드 준비

첫 실행 때 한 번만 진행합니다.

```bat
cd backend_local
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

준비가 끝나면 백엔드를 실행합니다.

```bat
run_local.cmd
```

백엔드는 `http://127.0.0.1:8000`에서 실행됩니다. 터미널을 종료하면 백엔드도 종료됩니다.

### 4. 프론트엔드 실행

백엔드 터미널은 그대로 두고 새로운 터미널을 하나 더 엽니다.

```bat
cd KDT_final_project_2team_Demo\frontend
run_local.cmd
```

최초 실행에서는 프론트엔드 패키지를 자동으로 설치하므로 시간이 조금 걸릴 수 있습니다.
터미널에 표시되는 `http://localhost:5173` 주소를 웹 브라우저에서 엽니다.

### 5. 실행 확인

다음 주소가 정상적으로 열리면 로컬 실행이 완료된 것입니다.

- 프론트엔드: `http://localhost:5173`
- 백엔드 API 문서: `http://127.0.0.1:8000/docs`

## 로컬 실행 구성

```text
웹 브라우저
    ↓
frontend (React, Vite / 5173)
    ↓
backend_local (FastAPI / 8000)
    ├─ SQLite: backend_local/local-data/
    └─ 파일 저장소: backend_local/local-storage/
```

`backend_local`은 PostgreSQL이나 MinIO 없이 SQLite와 로컬 파일 저장소만 사용합니다.
