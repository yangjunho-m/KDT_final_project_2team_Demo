# AGENTS.md

모든 문서는 한국어로 작성한다.

## 목적

이 파일은 AI 코딩 도구, 자동화 에이전트, 팀원이 이 프로젝트에서 코드를 작성하거나 수정할 때 따라야 하는 규칙이다.

이 프로젝트는 Python 기반 딥러닝 학습, AI 추론 서버, 웹 서비스, DB, 배포를 포함한다.  
모든 작업은 **클린코드, 재현성, 테스트 가능성, 배포 가능성**을 기준으로 진행한다.

---

# 1. 프로젝트 목표

이 프로젝트의 목표는 국방 감시·정찰 데이터 분석 서비스를 구현하는 것이다.

서비스의 기본 흐름은 다음과 같다.

```text
사용자 파일 업로드
→ AI 서버 분석
→ 분석 결과 반환
→ 웹 화면 표시
→ DB 저장
→ 분석 이력 조회
```

---

# 2. 기본 작업 원칙

에이전트와 팀원은 다음 원칙을 반드시 따른다.

- 코드를 수정하기 전에 기존 구조와 실행 흐름을 먼저 파악한다.
- 요청받지 않은 기능을 임의로 추가하지 않는다.
- 사용하지 않는 대규모 구조 변경을 하지 않는다.
- 기존 함수명, API 경로, DB 컬럼명을 바꿀 때는 영향 범위를 먼저 확인한다.
- 비밀번호, API Key, 토큰, 개인정보를 코드에 직접 작성하지 않는다.
- 실행 가능한 상태를 유지한다.
- 변경 후 실행 방법이나 테스트 방법을 문서에 반영한다.
- 학습 코드와 서비스 코드를 섞지 않는다.
- 실험 코드는 `notebooks/` 또는 `ml/experiments/`에 둔다.
- 배포용 코드는 `backend/`, `frontend/`, `ai-server/`, `deploy/` 기준으로 정리한다.
- 코드는 사람이 먼저 이해할 수 있어야 하며, 성능 최적화는 실행 가능성과 가독성 다음에 수행한다.

---

# 3. 클린코드 핵심 원칙

이 프로젝트의 코드는 다음 기준을 만족해야 한다.

## 3.1 의도가 드러나는 이름 사용

좋은 이름은 주석보다 우선한다.

- 변수명, 함수명, 클래스명은 역할이 드러나게 작성한다.
- `data`, `result`, `temp`, `x`, `y`, `obj` 같은 모호한 이름은 피한다.
- 축약어는 팀에서 합의된 경우만 사용한다.
- 불리언 변수는 `is_`, `has_`, `can_`, `should_`로 시작하는 것을 권장한다.

나쁜 예:

```python
def proc(d):
    return d / 255
```

좋은 예:

```python
def normalize_image_pixels(image_array: np.ndarray) -> np.ndarray:
    return image_array / 255.0
```

## 3.2 함수는 하나의 역할만 한다

- 함수 하나는 하나의 책임만 가진다.
- 함수명에 `and`, `or`가 들어갈 정도로 역할이 많으면 분리한다.
- 함수 길이는 가능하면 50줄 이하로 유지한다.
- 중첩 `if`, `for`는 3단계 이상 깊어지지 않게 한다.
- 반복되는 코드는 함수로 분리한다.

나쁜 예:

```python
def train_and_evaluate_and_save_model():
    ...
```

좋은 예:

```python
def train_model(...):
    ...


def evaluate_model(...):
    ...


def save_model(...):
    ...
```

## 3.3 주석은 이유를 설명한다

- 코드가 무엇을 하는지는 이름과 구조로 표현한다.
- 주석은 “왜 이렇게 했는지”를 설명할 때 사용한다.
- 오래된 주석, 코드와 맞지 않는 주석은 반드시 삭제한다.
- 임시 주석 처리된 코드는 커밋하지 않는다.

나쁜 예:

```python
# 이미지 정규화
image = image / 255
```

좋은 예:

```python
# 사전학습 모델 입력 범위와 맞추기 위해 0~1 범위로 변환한다.
image = image / 255.0
```

## 3.4 하드코딩 금지

다음 값은 코드에 직접 흩뿌리지 않는다.

- 파일 경로
- 모델 경로
- 데이터 경로
- 하이퍼파라미터
- API URL
- DB 접속 정보
- 임계값
- 클래스 이름 목록

설정값은 `.env`, `config.yaml`, 상수 파일, 환경변수로 관리한다.

나쁜 예:

```python
model = torch.load("/content/drive/MyDrive/final/best.pt")
threshold = 0.73
```

좋은 예:

```python
model = torch.load(settings.model_path)
threshold = settings.confidence_threshold
```

## 3.5 중복 제거

- 같은 코드가 2번 이상 반복되면 함수화를 검토한다.
- 같은 설정이 여러 파일에 반복되면 설정 파일로 분리한다.
- 같은 API 응답 형식은 공통 응답 객체로 관리한다.
- 같은 전처리 로직은 학습과 추론에서 공유한다.

## 3.6 입력 검증과 실패 처리

외부에서 들어오는 값은 항상 검증한다.

- 업로드 파일 확장자 검증
- 파일 크기 검증
- 빈 파일 검증
- 좌표, 이미지, 음향 데이터 형식 검증
- API 요청 파라미터 검증
- DB 저장 전 필수값 검증

실패할 수 있는 코드는 실패를 전제로 작성한다.

```python
if not file_path.exists():
    raise FileNotFoundError(f"파일을 찾을 수 없습니다: {file_path}")
```

## 3.7 테스트 가능한 코드 작성

- 함수는 입력과 출력이 명확해야 한다.
- 함수 내부에서 파일, DB, API에 직접 접근하는 코드는 최소화한다.
- 외부 의존성은 주입받을 수 있게 작성한다.
- 랜덤성이 있는 코드는 시드를 고정할 수 있어야 한다.
- 테스트하기 어려운 거대한 함수는 작은 함수로 분리한다.

## 3.8 삭제하기 쉬운 코드 작성

- 실험용 코드는 서비스 코드와 분리한다.
- 임시 코드는 `TODO`와 담당자, 날짜를 남긴다.
- 사용하지 않는 함수, 변수, import는 제거한다.
- 기능 변경 없이 구조만 바꾸는 경우 `refactor/*` 브랜치에서 작업한다.

```python
# TODO(홍길동, 2026-06-10): 임시 임계값. 검증 결과에 따라 config.yaml로 이동 예정.
```

---

# 4. 작업 우선순위

작업할 때 우선순위는 다음과 같다.

1. 실행 가능성
2. 코드 가독성
3. 테스트 가능성
4. 데이터 및 모델 재현성
5. API와 DB의 일관성
6. 배포 가능성
7. 성능 최적화

성능 최적화보다 먼저 실행 가능하고 이해 가능한 구조를 유지한다.

---

# 5. Git 작업 규칙

이 프로젝트는 `main`, `develop`, 기능별 브랜치를 기준으로 작업한다.  
모든 작업은 가능한 한 브랜치를 분리하고, Pull Request를 통해 통합한다.

## 5.1 브랜치 규칙

```text
main         : 최종 배포용 브랜치
develop      : 개발 통합 브랜치
feature/*    : 새로운 기능 개발
fix/*        : 오류 수정
docs/*       : 문서 작성 또는 수정
refactor/*   : 기능 변화 없는 코드 구조 개선
experiment/* : 모델 실험, 학습 코드, 실험 결과 정리
deploy/*     : Docker, 서버, 배포 설정 작업
```

브랜치 이름은 작업 목적을 짧고 명확하게 작성한다.

```text
feature/audio-upload
feature/predict-api
fix/model-loading-error
docs/api-spec
refactor/preprocess-pipeline
experiment/cnn-baseline
deploy/docker-compose
```

에이전트와 팀원은 다음을 지킨다.

- `main` 브랜치에 직접 커밋하지 않는다.
- 기능 개발은 `feature/*` 브랜치에서 진행한다.
- 버그 수정은 `fix/*` 브랜치에서 진행한다.
- 모델 실험은 `experiment/*` 브랜치에서 진행한다.
- 문서만 수정하는 경우 `docs/*` 브랜치를 사용한다.
- 배포 설정 작업은 `deploy/*` 브랜치를 사용한다.
- 작업 완료 후 `develop` 브랜치로 Pull Request를 생성한다.
- 최종 배포가 필요한 경우에만 `develop`에서 `main`으로 병합한다.

## 5.2 커밋 메시지 규칙

커밋 메시지는 다음 형식을 사용한다.

```text
타입: 작업 내용 요약
```

| 타입 | 의미 |
|---|---|
| `feat` | 새로운 기능 추가 |
| `fix` | 오류 수정 |
| `docs` | 문서 작성 또는 수정 |
| `refactor` | 기능 변화 없는 코드 구조 개선 |
| `style` | 포맷팅, 공백 등 코드 의미 없는 수정 |
| `test` | 테스트 코드 추가 또는 수정 |
| `chore` | 설정, 빌드, 패키지 관리 |
| `experiment` | 모델 실험 코드 또는 실험 결과 추가 |
| `deploy` | Docker, 서버, 배포 관련 작업 |

예시:

```text
feat: 음성 파일 업로드 API 추가
feat: 분석 결과 저장 API 추가
fix: 모델 파일 경로 오류 수정
docs: API 명세서 초안 작성
refactor: 전처리 함수 분리
test: 추론 API 테스트 추가
experiment: CNN 베이스라인 학습 코드 추가
deploy: docker-compose 설정 추가
```

커밋 작성 시 다음을 지킨다.

- 한 커밋에는 하나의 목적만 담는다.
- 여러 기능을 한 번에 커밋하지 않는다.
- 실행되지 않는 코드는 커밋하지 않는다.
- 대용량 데이터, 모델 파일, `.env` 파일은 커밋하지 않는다.
- 실험 결과를 커밋할 때는 코드, 설정 파일, 결과 요약을 함께 남긴다.

## 5.3 Pull Request 규칙

모든 기능 작업, 오류 수정, 실험 정리는 Pull Request를 통해 병합한다.

PR에는 다음 내용을 포함한다.

```markdown
## 작업 목적

- 

## 변경한 파일

- 

## 테스트 방법

- 

## 실행 결과

- 

## 클린코드 확인

- [ ] 함수와 클래스의 역할이 명확한가?
- [ ] 중복 코드가 제거되었는가?
- [ ] 하드코딩된 값이 없는가?
- [ ] 예외 처리가 적절한가?
- [ ] 테스트 또는 실행 확인을 했는가?

## 관련 이슈 또는 참고사항

- 
```

PR 제목은 다음 형식을 권장한다.

```text
[타입] 작업 내용 요약
```

---

# 6. 폴더 구조 규칙

권장 폴더 구조는 다음과 같다.

```text
project-root/
│
├─ backend/
├─ frontend/
├─ ai-server/
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

에이전트는 다음을 지킨다.

- 원본 데이터는 `data/raw/`에 둔다.
- 전처리 데이터는 `data/processed/`에 둔다.
- GitHub에 올릴 작은 예시 데이터만 `data/sample/`에 둔다.
- 대용량 데이터, 모델 파일, 학습 결과는 GitHub 추적 대상에서 제외한다.
- 문서 변경이 필요한 작업은 `docs/`도 함께 갱신한다.
- 공통 로직은 여러 위치에 복사하지 말고 `utils/`, `services/`, `core/` 등 역할에 맞는 위치에 둔다.

---

# 7. Python 코드 작성 규칙

## 7.1 네이밍

- 변수명: `snake_case`
- 함수명: `snake_case`
- 클래스명: `PascalCase`
- 상수명: `UPPER_SNAKE_CASE`
- 파일명: `snake_case.py`
- 테스트 파일명: `test_기능명.py`

## 7.2 타입 힌트

- 함수 인자와 반환값에는 가능한 한 타입 힌트를 작성한다.
- 복잡한 자료구조는 `TypedDict`, `dataclass`, `pydantic` 모델 사용을 검토한다.
- `Any`는 정말 필요한 경우만 사용한다.

```python
from pathlib import Path


def load_image(file_path: Path) -> np.ndarray:
    ...
```

## 7.3 함수 규칙

- 함수 하나는 하나의 역할만 가진다.
- 가능하면 함수 길이를 50줄 이하로 유지한다.
- 경로, 하이퍼파라미터, 모델명은 하드코딩하지 않는다.
- 반복 코드는 함수로 분리한다.
- 외부 입력값은 검증한다.
- 함수에는 가능한 한 타입 힌트를 작성한다.
- 반환값이 여러 개인 경우 의미 있는 객체나 `dataclass` 사용을 검토한다.

## 7.4 예외 처리

- 파일 없음, 형식 오류, 모델 로딩 실패, DB 연결 실패를 구분한다.
- `except Exception`만 단독으로 사용하지 않는다.
- 사용자에게는 내부 스택 트레이스를 그대로 보여주지 않는다.
- 로그에는 원인 파악에 필요한 정보를 남기되 민감 정보는 남기지 않는다.

나쁜 예:

```python
try:
    model = load_model(path)
except Exception:
    print("error")
```

좋은 예:

```python
try:
    model = load_model(model_path)
except FileNotFoundError as error:
    logger.exception("모델 파일을 찾을 수 없습니다. path=%s", model_path)
    raise ModelLoadError("모델 파일을 찾을 수 없습니다.") from error
```

## 7.5 로그 규칙

- `print()` 대신 `logging`을 사용한다.
- 로그에는 요청 ID, 파일명, 처리 단계 등 디버깅에 필요한 정보를 남긴다.
- 개인정보, 토큰, 비밀번호, 원본 민감 데이터는 로그에 남기지 않는다.
- 에러 로그는 원인을 추적할 수 있어야 한다.

## 7.6 코드 포맷팅과 정적 검사

Python 코드는 다음 도구 사용을 권장한다.

```text
ruff     : lint, import 정리
black    : 코드 포맷팅
mypy     : 타입 검사
pytest   : 테스트
```

권장 실행 명령:

```bash
ruff check .
black .
mypy .
pytest
```

팀 상황에 따라 `pyproject.toml`에 규칙을 고정한다.

---

# 8. 딥러닝 학습 코드 규칙

## 8.1 재현성

학습 코드에는 반드시 다음을 포함한다.

- 랜덤 시드 고정
- 데이터 분할 기준
- 모델 구조
- 하이퍼파라미터
- 평가 지표
- 학습 결과 저장 경로
- 사용한 데이터 버전 또는 생성 기준

시드 고정 예시:

```python
def seed_everything(seed: int = 42) -> None:
    import random
    import numpy as np
    import torch

    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
```

## 8.2 설정 파일

하이퍼파라미터는 코드에 흩뿌리지 않고 설정 파일로 관리한다.

```text
ml/configs/cnn_baseline.yaml
ml/configs/transformer_experiment.yaml
```

설정 파일에는 실험 의도, 주요 하이퍼파라미터, 데이터 경로, 결과 저장 경로를 명확히 작성한다.

## 8.3 학습 결과 저장

학습 결과는 다음 구조를 따른다.

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

README.md에는 실험 목적, 설정, 결과, 해석이 자동으로 저장되게 한다.

## 8.4 데이터 누수 방지

- train, valid, test를 명확히 분리한다.
- test 데이터는 최종 평가에만 사용한다.
- 같은 원본에서 파생된 데이터가 서로 다른 split에 섞이지 않게 한다.
- 전처리 과정에서 전체 데이터 통계를 사용하지 않는다.
- scaler, encoder는 train 데이터로만 fit한다.
- 학습에서 사용한 전처리와 추론에서 사용한 전처리가 달라지지 않게 한다.

## 8.5 노트북 생성 규칙

- 노트북 파일명은 겹치지 않게 생성한다.
- 노트북 파일명에는 날짜, 작성자 또는 실험명, 목적을 포함한다.
- 노트북에서 직접 모든 로직을 작성하지 않고, 가능하면 `ml/` 모듈을 불러와 실험한다.
- 학습 결과는 GitHub 저장소가 아니라 Google Drive의 결과 저장 폴더에 저장한다.

```text
2026-06-04_{name}_audio_eda.ipynb
2026-06-05_{name}_cnn_baseline.ipynb
2026-06-06_{name}_model_comparison.ipynb
```

Colab 노트북은 처음 시작을 다음과 같이 한다.

```python
from google.colab import drive
drive.mount('/content/drive')

!git clone https://github.com/YOUR_GITHUB_ORG/YOUR_REPOSITORY.git
%cd KDT_2026_Acorn_7th_2team_final_project

!pip install -r requirements.txt
!nvidia-smi
```

학습 결과는 Google Drive의 다음 경로 아래에 저장한다.

```text
/content/drive/MyDrive/final_project/ml/runs/
```

---

# 9. AI 추론 서버 규칙

AI 추론 서버는 가능하면 FastAPI 기준으로 작성한다.

권장 구조:

```text
ai-server/
├─ app/
│  ├─ main.py
│  ├─ api/
│  │  └─ predict.py
│  ├─ core/
│  │  └─ config.py
│  ├─ services/
│  │  ├─ model_service.py
│  │  └─ preprocess_service.py
│  └─ schemas/
│     └─ prediction.py
├─ models/
├─ requirements.txt
└─ README.md
```

## 9.1 추론 규칙

- 서버 시작 시 모델을 한 번만 로드한다.
- 요청마다 모델을 다시 로드하지 않는다.
- 업로드 파일 형식을 검증한다.
- 추론 시간과 confidence를 반환한다.
- 모델 경로는 환경변수 또는 설정 파일로 관리한다.
- 추론 실패 시 일관된 에러 응답을 반환한다.
- 추론 결과 후처리 로직은 API 라우터가 아니라 서비스 계층에 둔다.

응답 예시:

```json
{
  "label": "drone",
  "confidence": 0.92,
  "risk_score": 85,
  "inference_time_ms": 123
}
```

---

# 10. 웹 백엔드 규칙

웹 백엔드는 Spring Boot 또는 FastAPI를 사용할 수 있다.

## 10.1 레이어 분리

다음 역할을 분리한다.

```text
controller / router  : 요청과 응답 처리
service              : 비즈니스 로직
repository / dao     : DB 접근
dto / schema         : 요청/응답 객체
entity / model       : DB 테이블 매핑
```

라우터나 컨트롤러에는 비즈니스 로직을 넣지 않는다.

## 10.2 API 응답 형식

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

## 10.3 API 문서화

API를 추가하거나 변경하면 `docs/api_spec.md`를 갱신한다.

문서에는 다음을 포함한다.

- API 경로
- HTTP Method
- 요청 파라미터
- 요청 예시
- 응답 예시
- 에러 코드

---

# 11. DB 규칙

## 11.1 테이블 규칙

- 테이블명은 소문자와 언더스코어를 사용한다.
- 기본키는 `id`로 통일한다.
- 생성일은 `created_at`으로 통일한다.
- 수정일은 `updated_at`으로 통일한다.
- 필요한 경우 삭제 여부는 `is_deleted` 또는 `deleted_at`을 사용한다.
- 파일은 DB에 직접 저장하지 않고 경로만 저장한다.
- 상태값은 문자열 남발 대신 enum 또는 코드 테이블 사용을 검토한다.

## 11.2 DB 접근 규칙

- SQL 또는 ORM 쿼리는 repository/dao 계층에만 둔다.
- 서비스 계층에서 직접 SQL을 작성하지 않는다.
- 트랜잭션 범위를 명확히 한다.
- N+1 문제가 발생할 수 있는 조회는 사전에 확인한다.
- DB 구조가 변경되면 `docs/db_schema.md`를 갱신한다.

---

# 12. 프론트엔드 규칙

- 사용자가 다음 행동을 쉽게 알 수 있어야 한다.
- 로딩 상태를 표시한다.
- 에러 메시지를 사용자 친화적으로 표시한다.
- 분석 결과는 표, 카드, 그래프 등으로 명확히 표시한다.
- API 경로는 한 곳에서 관리한다.
- 중복 컴포넌트는 공통 컴포넌트로 분리한다.
- 화면 컴포넌트와 API 호출 로직을 가능하면 분리한다.
- 복잡한 상태는 이름을 명확히 하고, 불필요한 전역 상태를 만들지 않는다.

---

# 13. 환경변수와 보안 규칙

에이전트는 다음 파일을 생성하거나 수정할 수 있다.

- `.env.example`
- 설정 템플릿
- Docker 환경변수 예시

에이전트는 다음을 절대 하지 않는다.

- 실제 `.env` 내용을 GitHub에 포함
- 실제 DB 비밀번호 작성
- API Key 작성
- 토큰 작성
- 개인정보를 로그에 출력
- 업로드 파일의 민감 정보를 무단 저장

`.gitignore`에는 다음 항목을 포함한다.

```text
.env
*.pt
*.pth
*.pkl
data/raw/
data/processed/
ml/runs/
uploads/
__pycache__/
.ipynb_checkpoints/
```

---

# 14. Docker 및 배포 규칙

배포 관련 작업은 다음을 우선한다.

- Dockerfile이 재현 가능해야 한다.
- docker-compose로 로컬 실행이 가능해야 한다.
- 환경변수로 설정을 바꿀 수 있어야 한다.
- 모델 파일 경로가 컨테이너 내부에서 올바르게 연결되어야 한다.
- README에 배포 실행 방법을 기록한다.

배포 전 확인:

- 백엔드 실행 확인
- AI 서버 실행 확인
- DB 연결 확인
- 프론트엔드 API 연결 확인
- 파일 업로드 확인
- 모델 추론 확인
- 분석 결과 저장 확인

---

# 15. 테스트 규칙

기능을 추가하면 최소한 다음 중 하나를 수행한다.

- 단위 테스트 추가
- API 호출 테스트
- 실행 결과 캡처
- README에 테스트 방법 기록

Python 테스트는 `pytest`를 권장한다.

```text
tests/
├─ test_preprocess.py
├─ test_model_service.py
└─ test_api.py
```

테스트 작성 기준:

- 정상 케이스 1개 이상
- 실패 케이스 1개 이상
- 경계값 케이스가 있으면 추가
- 외부 API, DB, 파일 의존성은 가능하면 mock 처리

---

# 16. 문서 갱신 규칙

에이전트는 다음 상황에서 문서를 갱신한다.

- 실행 방법 변경
- API 변경
- DB 구조 변경
- 환경변수 추가
- 모델 파일 경로 변경
- 배포 방식 변경
- 폴더 구조 변경
- 주요 실험 결과 추가

갱신 대상 문서:

- `README.md`
- `docs/api_spec.md`
- `docs/db_schema.md`
- `docs/deploy_guide.md`
- `docs/model_report.md`

---

# 17. 코드 리뷰 기준

PR 리뷰 또는 에이전트 코드 검토 시 다음을 확인한다.

## 17.1 구조

- [ ] 파일 위치가 역할에 맞는가?
- [ ] controller/router에 비즈니스 로직이 들어가지 않았는가?
- [ ] 학습 코드와 서비스 코드가 분리되어 있는가?
- [ ] 공통 로직이 중복 구현되지 않았는가?

## 17.2 가독성

- [ ] 이름만 봐도 역할을 알 수 있는가?
- [ ] 함수가 한 가지 일만 하는가?
- [ ] 불필요하게 긴 함수가 없는가?
- [ ] 주석은 필요한 이유를 설명하는가?

## 17.3 안정성

- [ ] 입력값 검증이 있는가?
- [ ] 예외 처리가 구체적인가?
- [ ] 실패 응답 형식이 일관적인가?
- [ ] 민감 정보가 로그나 코드에 없는가?

## 17.4 재현성

- [ ] 설정 파일 또는 환경변수로 실행 조건을 관리하는가?
- [ ] 랜덤 시드가 고정되어 있는가?
- [ ] 데이터 분할 기준이 명확한가?
- [ ] 실험 결과 저장 경로가 명확한가?

## 17.5 테스트

- [ ] 테스트 또는 실행 확인 방법이 있는가?
- [ ] 실패 케이스 테스트가 있는가?
- [ ] README 또는 PR에 실행 결과가 적혀 있는가?

---

# 18. 코드 수정 전 체크리스트

작업 전 확인:

- [ ] 어떤 기능을 수정하는지 명확한가?
- [ ] 관련 파일 위치를 확인했는가?
- [ ] 기존 API나 DB 구조에 영향이 있는가?
- [ ] 문서 수정이 필요한가?
- [ ] 테스트 방법이 있는가?
- [ ] 설정값을 하드코딩하지 않을 방법을 정했는가?

---

# 19. 코드 수정 후 체크리스트

작업 후 확인:

- [ ] 코드가 실행되는가?
- [ ] 기존 기능이 깨지지 않았는가?
- [ ] 함수와 클래스의 책임이 명확한가?
- [ ] 중복 코드가 제거되었는가?
- [ ] 에러 처리가 되어 있는가?
- [ ] 민감 정보가 포함되지 않았는가?
- [ ] 불필요한 디버그 출력이 없는가?
- [ ] 문서를 갱신했는가?
- [ ] 테스트 방법을 남겼는가?

---

# 20. 금지 작업

에이전트는 다음 작업을 하지 않는다.

- 요청 없이 전체 프로젝트 구조를 갈아엎기
- 요청 없이 라이브러리 대량 변경
- API 응답 형식 임의 변경
- DB 컬럼명 임의 변경
- 학습 코드와 배포 코드를 섞기
- 실제 비밀번호나 API Key 작성
- 대용량 데이터나 모델 파일을 Git 추적 대상에 추가
- 실행되지 않는 코드를 main 또는 develop 기준으로 제안
- 출처 불명 데이터를 학습 데이터로 사용하는 코드 작성
- 의미 없는 변수명으로 빠르게만 구현하기
- 복사 붙여넣기로 중복 로직을 늘리기
- 임시 디버그 코드를 그대로 커밋하기

---

# 21. 좋은 작업 결과 기준

좋은 작업 결과는 다음 조건을 만족한다.

- README만 보고 실행할 수 있다.
- 코드가 역할별로 분리되어 있다.
- 함수명과 변수명만 봐도 의도를 알 수 있다.
- 함수가 작고 테스트하기 쉽다.
- 설정값이 코드에 흩어져 있지 않다.
- 모델 학습 결과가 재현 가능하다.
- API 요청과 응답이 문서화되어 있다.
- DB 구조가 문서화되어 있다.
- Docker 또는 배포 환경에서 실행 가능하다.
- 팀원이 이어서 작업할 수 있다.
- README만 보고도 프로젝트 관련 포트폴리오를 작성할 수 있다.
