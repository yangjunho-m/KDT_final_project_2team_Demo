# KDT 2026 Acorn 7기 2팀 Final Project

국방 감시·정찰 데이터 분석 서비스를 구현하는 팀 프로젝트입니다.

서비스는 사용자가 파일을 업로드하면 AI 서버가 데이터를 분석하고, 분석 결과를 웹 화면에 표시한 뒤 DB에 저장하여 이력 조회까지 제공하는 흐름을 목표로 합니다.

## 문서 바로가기

기존 README에 있던 문서 목록입니다.

- [AGENTS.md](./AGENTS.md): AI 코딩 도구, 자동화 에이전트, 팀원이 따라야 할 코드 작성 및 수정 규칙
- [coding_rules_clean_code_deeplearning_web.md](./coding_rules_clean_code_deeplearning_web.md): `AGENTS.md`에 반하지 않도록 정리한 사람이 읽는 클린 코드 및 딥러닝/웹 개발 규칙
- [team_project_coding_checklist.md](./team_project_coding_checklist.md): 팀 프로젝트 진행을 위한 체크리스트

## 서비스 흐름

```text
사용자 파일 업로드
→ AI 서버 분석
→ 분석 결과 반환
→ 웹 화면 표시
→ DB 저장
→ 분석 이력 조회
```

## 프로젝트 구조

```text
project-root/
├─ backend/
├─ frontend/
├─ ai-server/
│  ├─ app/
│  │  ├─ api/
│  │  ├─ core/
│  │  ├─ services/
│  │  └─ schemas/
│  └─ models/
├─ ml/
│  ├─ configs/
│  ├─ experiments/
│  ├─ models/
│  ├─ trainers/
│  ├─ utils/
│  ├─ runs/
│  └─ scripts/
├─ notebooks/
├─ data/
│  ├─ raw/
│  ├─ processed/
│  └─ sample/
├─ docs/
├─ deploy/
├─ tests/
├─ .env.example
├─ .gitignore
├─ README.md
└─ AGENTS.md
```

## 폴더 역할

| 경로 | 역할 |
|---|---|
| `backend/` | 웹 백엔드 API, DB 연동, 비즈니스 로직 |
| `frontend/` | 사용자 화면, 파일 업로드, 분석 결과 표시 |
| `ai-server/` | AI 추론 서버, 모델 로딩, 전처리, 예측 API |
| `ml/` | 모델 학습 코드, 설정, 실험 코드, 학습 유틸리티 |
| `notebooks/` | EDA, 실험 검증용 노트북 |
| `data/raw/` | 원본 데이터 |
| `data/processed/` | 전처리된 데이터 |
| `data/sample/` | GitHub에 올릴 수 있는 작은 예시 데이터 |
| `docs/` | API, DB, 배포, 모델 리포트 문서 |
| `deploy/` | Docker, 서버, 배포 설정 |
| `tests/` | 테스트 코드 |

## 작업 원칙

- 코드를 수정하기 전에 기존 구조를 먼저 파악합니다.
- 요청받지 않은 기능을 임의로 추가하지 않습니다.
- 학습 코드와 서비스 코드는 섞지 않습니다.
- 실험 코드는 `notebooks/` 또는 `ml/experiments/`에 둡니다.
- 배포용 코드는 `backend/`, `frontend/`, `ai-server/`, `deploy/` 기준으로 정리합니다.
- 비밀번호, API Key, 토큰, 개인정보는 코드에 직접 작성하지 않습니다.
- 변경 후 실행 방법이나 테스트 방법이 바뀌면 문서를 함께 갱신합니다.

## Git 규칙

브랜치는 다음 기준을 사용합니다.

| 브랜치 | 용도 |
|---|---|
| `main` | 최종 배포용 브랜치 |
| `develop` | 개발 통합 브랜치 |
| `feature/*` | 새로운 기능 개발 |
| `fix/*` | 오류 수정 |
| `docs/*` | 문서 작성 또는 수정 |
| `refactor/*` | 기능 변화 없는 코드 구조 개선 |
| `experiment/*` | 모델 실험, 학습 코드, 실험 결과 정리 |
| `deploy/*` | Docker, 서버, 배포 설정 작업 |

커밋 메시지는 다음 형식을 사용합니다.

```text
타입: 작업 내용 요약
```

예시:

```text
feat: 음성 파일 업로드 API 추가
fix: 모델 파일 경로 오류 수정
docs: API 명세서 초안 작성
experiment: CNN 베이스라인 학습 코드 추가
deploy: docker-compose 설정 추가
```

## API 응답 형식

성공 응답:

```json
{
  "success": true,
  "data": {},
  "message": "요청이 성공했습니다."
}
```

실패 응답:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "사용자에게 보여줄 메시지"
  }
}
```

AI 추론 응답 예시:

```json
{
  "label": "drone",
  "confidence": 0.92,
  "risk_score": 85,
  "inference_time_ms": 123
}
```

## 데이터 및 모델 관리

- 원본 데이터는 `data/raw/`에 둡니다.
- 전처리 데이터는 `data/processed/`에 둡니다.
- GitHub에는 작은 예시 데이터만 `data/sample/`에 올립니다.
- 대용량 데이터, 모델 파일, 학습 결과는 Git 추적 대상에서 제외합니다.
- 학습 결과는 기본적으로 `ml/runs/` 구조를 따릅니다.

```text
ml/runs/
└─ YYYY-MM-DD_experiment_name/
   ├─ config.yaml
   ├─ train_log.csv
   ├─ metrics.json
   ├─ best_model.pt
   ├─ confusion_matrix.png
   └─ README.md
```

## 환경변수

실제 환경변수는 `.env`에 작성하고, Git에는 포함하지 않습니다.

예시는 [.env.example](./.env.example)을 참고합니다.

```text
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8080
DATABASE_URL=

AI_SERVER_HOST=0.0.0.0
AI_SERVER_PORT=8000
MODEL_PATH=ai-server/models/model.pt

FRONTEND_API_BASE_URL=http://localhost:8080
FRONTEND_AI_API_BASE_URL=http://localhost:8000
```

## 실행 방법

아직 각 서비스의 구현체와 의존성 파일이 확정되지 않았습니다.

서비스별 구현이 추가되면 아래 문서를 함께 갱신합니다.

- 백엔드 실행 방법
- 프론트엔드 실행 방법
- AI 서버 실행 방법
- Docker 또는 docker-compose 실행 방법
- 테스트 실행 방법

## 문서 갱신 기준

다음 변경이 있으면 관련 문서를 함께 갱신합니다.

- 실행 방법 변경
- API 변경
- DB 구조 변경
- 환경변수 추가
- 모델 파일 경로 변경
- 배포 방식 변경
- 폴더 구조 변경

주요 갱신 대상:

- `README.md`
- `docs/api_spec.md`
- `docs/db_schema.md`
- `docs/deploy_guide.md`
- `docs/model_report.md`
