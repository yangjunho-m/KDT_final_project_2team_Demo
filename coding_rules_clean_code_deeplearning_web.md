# 팀프로젝트 코딩 규칙

## 문서 목적

이 문서는 팀프로젝트의 코드 품질을 일정하게 유지하기 위한 공통 규칙입니다.

이 문서는 팀원이 실제 개발할 때 참고하는 세부 코딩 규칙이며,  
AI 코딩 도구와 자동화 에이전트가 따라야 하는 핵심 규칙은 `AGENTS.md`를 기준으로 합니다.

따라서 이 문서는 `AGENTS.md`와 충돌하지 않도록 다음 원칙을 따릅니다.

- `AGENTS.md`의 프로젝트 구조, Git 규칙, 보안 규칙을 우선한다.
- 이 문서는 팀원들이 개발 중 참고할 세부 기준을 제공한다.
- 규칙이 충돌할 경우 `AGENTS.md`를 우선 적용한다.
- 프로젝트 구조, API 응답 형식, DB 컬럼명, 배포 방식은 임의로 바꾸지 않는다.

프로젝트 목표는 다음과 같습니다.

- 클린코드 기반 구현
- Python 딥러닝 학습 코드의 재현성 확보
- AI 추론 서버와 웹 서비스의 분리
- 웹 서비스 배포 가능한 구조 유지
- 팀원 간 코드 충돌 최소화
- 발표와 산출물 작성에 필요한 근거 확보

---

# 1. 기본 원칙

## 1.1 가장 중요한 기준

- [ ] 코드는 읽는 사람이 이해하기 쉬워야 한다.
- [ ] 하나의 함수는 하나의 역할만 한다.
- [ ] 중복 코드는 함수나 클래스로 분리한다.
- [ ] 임시 코드는 반드시 표시하거나 삭제한다.
- [ ] 실행 방법이 문서화되어 있어야 한다.
- [ ] 비밀번호, API Key, 토큰, DB 접속 정보는 코드에 직접 쓰지 않는다.
- [ ] 학습 결과와 실험 조건은 기록한다.
- [ ] 배포 환경과 로컬 환경 차이를 최소화한다.
- [ ] 실험 코드와 서비스 코드를 섞지 않는다.
- [ ] README만 보고 실행 가능한 상태를 목표로 한다.

## 1.2 작업 전 확인

작업을 시작하기 전에 다음을 확인합니다.

- [ ] 어떤 기능을 수정하거나 추가하는지 명확한가?
- [ ] 관련 파일 위치를 확인했는가?
- [ ] 기존 API, DB 구조, 모델 경로에 영향이 있는가?
- [ ] 문서 수정이 필요한가?
- [ ] 테스트 방법이 있는가?
- [ ] 작업 브랜치를 분리했는가?

## 1.3 작업 후 확인

작업이 끝난 뒤 다음을 확인합니다.

- [ ] 코드가 실행되는가?
- [ ] 기존 기능이 깨지지 않았는가?
- [ ] 에러 처리가 되어 있는가?
- [ ] 민감 정보가 포함되지 않았는가?
- [ ] 불필요한 디버그 출력이 없는가?
- [ ] 문서를 갱신했는가?
- [ ] 테스트 방법 또는 실행 결과를 남겼는가?

---

# 2. 프로젝트 폴더 구조 규칙

권장 구조는 다음과 같습니다.

```text
project-root/
│
├─ backend/                 # 웹 백엔드 서버
├─ frontend/                # 웹 프론트엔드
├─ ai-server/               # AI 모델 추론 API 서버
├─ ml/                      # 모델 학습 코드
│  ├─ configs/              # 실험 설정 파일
│  ├─ experiments/          # 실험용 코드
│  ├─ models/               # 모델 구조 코드
│  ├─ trainers/             # 학습 루프 코드
│  ├─ utils/                # 공통 유틸 함수
│  ├─ runs/                 # 학습 결과 저장 위치
│  └─ scripts/              # 실행 스크립트
├─ notebooks/               # 실험용 노트북
├─ data/
│  ├─ raw/                  # 원본 데이터
│  ├─ processed/            # 전처리 데이터
│  └─ sample/               # GitHub 업로드용 샘플 데이터
├─ docs/
│  ├─ api_spec.md
│  ├─ db_schema.md
│  ├─ coding_rules.md
│  ├─ deploy_guide.md
│  ├─ model_report.md
│  └─ meeting_notes.md
├─ deploy/
│  ├─ Dockerfile
│  ├─ docker-compose.yml
│  └─ nginx/
├─ tests/
├─ .env.example
├─ .gitignore
├─ README.md
└─ AGENTS.md
```

## 2.1 폴더 사용 규칙

- [ ] `backend/`에는 웹 백엔드 서버 코드를 둔다.
- [ ] `frontend/`에는 웹 프론트엔드 코드를 둔다.
- [ ] `ai-server/`에는 AI 추론 API 서버 코드를 둔다.
- [ ] `ml/`에는 학습 코드와 모델 관련 코드를 둔다.
- [ ] `ml/experiments/`에는 실험용 Python 코드를 둔다.
- [ ] `ml/runs/`에는 학습 결과를 저장한다.
- [ ] `notebooks/`에는 실험용 Colab 또는 Jupyter Notebook을 둔다.
- [ ] `data/raw/`에는 원본 데이터를 저장한다.
- [ ] `data/processed/`에는 전처리된 데이터를 저장한다.
- [ ] `data/sample/`에는 GitHub에 올릴 수 있는 작은 샘플만 저장한다.
- [ ] `docs/`에는 API, DB, 배포, 모델, 회의록 문서를 둔다.
- [ ] `deploy/`에는 Docker, 배포 관련 파일을 둔다.
- [ ] `tests/`에는 테스트 코드를 둔다.

## 2.2 금지되는 폴더 사용

- [ ] 대용량 원본 데이터를 GitHub에 올리지 않는다.
- [ ] 대용량 모델 파일을 GitHub에 올리지 않는다.
- [ ] 실제 `.env` 파일을 GitHub에 올리지 않는다.
- [ ] 학습 결과 전체를 무분별하게 GitHub에 올리지 않는다.
- [ ] 서비스 코드와 실험 코드를 같은 파일에 섞지 않는다.
- [ ] 임시 파일을 프로젝트 루트에 방치하지 않는다.

---

# 3. Git 규칙

이 프로젝트는 `main`, `develop`, 기능별 브랜치를 기준으로 작업합니다.

## 3.1 브랜치 규칙

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

브랜치 이름 예시:

```text
feature/audio-upload
feature/predict-api
fix/model-loading-error
docs/api-spec
refactor/preprocess-pipeline
experiment/cnn-baseline
deploy/docker-compose
```

## 3.2 브랜치 사용 원칙

- [ ] `main` 브랜치에 직접 커밋하지 않는다.
- [ ] 기능 개발은 `feature/*` 브랜치에서 진행한다.
- [ ] 오류 수정은 `fix/*` 브랜치에서 진행한다.
- [ ] 문서 작업은 `docs/*` 브랜치에서 진행한다.
- [ ] 모델 실험은 `experiment/*` 브랜치에서 진행한다.
- [ ] 배포 설정은 `deploy/*` 브랜치에서 진행한다.
- [ ] 작업 완료 후 `develop` 브랜치로 Pull Request를 생성한다.
- [ ] 최종 배포가 필요한 경우에만 `develop`에서 `main`으로 병합한다.

## 3.3 커밋 메시지 규칙

커밋 메시지는 다음 형식을 사용합니다.

```text
타입: 작업 내용 요약
```

사용 가능한 타입:

| 타입 | 의미 |
|---|---|
| `feat` | 새로운 기능 추가 |
| `fix` | 오류 수정 |
| `docs` | 문서 작성 또는 수정 |
| `refactor` | 기능 변화 없는 코드 구조 개선 |
| `style` | 포맷팅, 세미콜론, 공백 등 코드 의미 없는 수정 |
| `test` | 테스트 코드 추가 또는 수정 |
| `chore` | 설정, 빌드, 패키지 관리 |
| `experiment` | 모델 실험 코드 또는 실험 결과 추가 |
| `deploy` | Docker, 서버, 배포 관련 작업 |

커밋 메시지 예시:

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

## 3.4 커밋 작성 원칙

- [ ] 한 커밋에는 하나의 목적만 담는다.
- [ ] 여러 기능을 한 번에 커밋하지 않는다.
- [ ] 실행되지 않는 코드는 커밋하지 않는다.
- [ ] 대용량 데이터, 모델 파일, `.env` 파일은 커밋하지 않는다.
- [ ] 실험 결과를 커밋할 때는 코드, 설정 파일, 결과 요약을 함께 남긴다.
- [ ] 커밋 메시지만 봐도 변경 내용을 이해할 수 있게 작성한다.

## 3.5 Pull Request 규칙

PR에는 다음 내용을 포함합니다.

```markdown
## 작업 목적

- 

## 변경한 파일

- 

## 테스트 방법

- 

## 실행 결과

- 

## 관련 이슈 또는 참고사항

- 
```

PR 제목 예시:

```text
[feat] 분석 결과 저장 API 구현
[fix] FastAPI 모델 로딩 오류 수정
[docs] API 명세서 초안 작성
[experiment] Mel-Spectrogram CNN 실험 추가
[deploy] Docker Compose 설정 추가
```

PR 작성 시 다음을 확인합니다.

- [ ] 작업 목적이 명확한가?
- [ ] 변경한 파일을 설명했는가?
- [ ] 실행 또는 테스트 방법을 작성했는가?
- [ ] 실행 결과를 확인했는가?
- [ ] API, DB, 환경변수 변경 사항이 문서에 반영되었는가?
- [ ] 민감 정보가 포함되지 않았는가?
- [ ] 대용량 데이터나 모델 파일이 포함되지 않았는가?

---

# 4. Python 코딩 규칙

## 4.1 Python 버전

- [ ] Python 3.10 또는 3.11 사용을 권장한다.
- [ ] 팀원 전체가 같은 Python 버전을 사용한다.
- [ ] 패키지 목록은 `requirements.txt` 또는 `pyproject.toml`로 관리한다.
- [ ] 새 패키지를 추가하면 설치 방법을 문서에 반영한다.
- [ ] Colab과 로컬 환경의 Python 버전 차이를 확인한다.

## 4.2 네이밍 규칙

| 대상 | 규칙 | 예시 |
|---|---|---|
| 변수 | `snake_case` | `file_path`, `batch_size` |
| 함수 | `snake_case` | `load_model()`, `train_one_epoch()` |
| 클래스 | `PascalCase` | `AudioClassifier`, `ModelTrainer` |
| 상수 | `UPPER_SNAKE_CASE` | `RANDOM_SEED`, `MODEL_PATH` |
| 파일명 | `snake_case.py` | `preprocess_audio.py` |

## 4.3 함수 작성 규칙

- [ ] 함수 하나는 하나의 역할만 한다.
- [ ] 함수 길이는 가능하면 50줄 이하로 유지한다.
- [ ] 입력값과 반환값을 명확히 한다.
- [ ] 외부 파일 경로를 함수 내부에 하드코딩하지 않는다.
- [ ] 하이퍼파라미터를 함수 내부에 흩뿌리지 않는다.
- [ ] 반복되는 코드는 함수로 분리한다.
- [ ] 외부 입력값은 검증한다.
- [ ] 가능한 한 타입 힌트를 작성한다.

좋은 예시:

```python
from pathlib import Path

def load_audio(file_path: str, sample_rate: int) -> tuple:
    audio, sr = librosa.load(file_path, sr=sample_rate)
    return audio, sr
```

나쁜 예시:

```python
def run():
    audio, sr = librosa.load("C:/Users/user/Desktop/data/test.wav")
    # 전처리, 모델 로딩, 예측, 저장을 전부 한 함수에서 처리
```

## 4.4 타입 힌트 규칙

가능하면 함수에는 타입 힌트를 작성합니다.

```python
def calculate_accuracy(y_true: list[int], y_pred: list[int]) -> float:
    correct = sum(t == p for t, p in zip(y_true, y_pred))
    return correct / len(y_true)
```

## 4.5 예외 처리 규칙

- [ ] 파일이 없을 때 명확한 에러 메시지를 출력한다.
- [ ] 파일 형식 오류와 파일 없음 오류를 구분한다.
- [ ] 모델 로딩 실패 시 원인을 알 수 있게 한다.
- [ ] 사용자가 업로드한 파일이 잘못된 형식이면 친절한 메시지를 반환한다.
- [ ] `except Exception`만 단독으로 쓰지 않는다.
- [ ] 사용자에게 내부 스택 트레이스를 그대로 보여주지 않는다.
- [ ] 로그에는 원인 파악에 필요한 정보를 남기되 민감 정보는 남기지 않는다.

예시:

```python
from pathlib import Path

def check_file_exists(file_path: str) -> None:
    if not Path(file_path).exists():
        raise FileNotFoundError(f"파일을 찾을 수 없습니다: {file_path}")
```

## 4.6 코드 포맷팅 권장

팀 내에서 가능하면 다음 도구 사용을 권장합니다.

```text
black      : Python 코드 포맷팅
isort      : import 정렬
ruff       : 빠른 린트 검사
pytest     : 테스트 실행
```

권장 명령어 예시:

```bash
black .
isort .
ruff check .
pytest
```

단, 도구 도입 여부는 팀 환경에 맞게 결정하고, 도입 시 README 또는 `docs/coding_rules.md`에 실행 방법을 기록합니다.

---

# 5. 딥러닝 학습 코드 규칙

## 5.1 재현성 규칙

학습 코드에는 반드시 시드를 고정합니다.

```python
import random
import numpy as np
import torch

def seed_everything(seed: int = 42) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
```

반드시 기록할 것:

- [ ] 랜덤 시드
- [ ] 데이터 분할 방식
- [ ] 모델 구조
- [ ] 하이퍼파라미터
- [ ] 평가 지표
- [ ] 학습 결과 저장 경로
- [ ] 사용한 데이터 버전
- [ ] 실행 환경

## 5.2 설정 파일 관리

하이퍼파라미터는 코드에 직접 흩뿌리지 말고 설정 파일로 관리합니다.

설정 파일 위치:

```text
ml/configs/
```

설정 파일 예시:

```yaml
seed: 42
batch_size: 32
epochs: 50
learning_rate: 0.001
model_name: cnn_baseline
sample_rate: 16000
data_path: data/processed/
output_dir: ml/runs/
```

설정 파일에는 다음을 포함합니다.

- [ ] 실험 목적
- [ ] 모델명
- [ ] 데이터 경로
- [ ] 하이퍼파라미터
- [ ] 평가 지표
- [ ] 결과 저장 경로

## 5.3 학습 결과 저장 규칙

학습 결과는 다음 구조로 저장합니다.

```text
ml/runs/
└─ 2026-06-04_cnn_baseline/
   ├─ config.yaml
   ├─ train_log.csv
   ├─ metrics.json
   ├─ best_model.pt
   ├─ confusion_matrix.png
   └─ README.md
```

반드시 저장할 것:

- [ ] 설정 파일
- [ ] 학습 로그
- [ ] 검증 성능
- [ ] 최종 모델 파일
- [ ] 혼동행렬 또는 평가 그래프
- [ ] 실험 요약 README
- [ ] 실패한 실험이라도 중요한 경우 원인 기록

## 5.4 실험 README 작성 규칙

각 실험 결과 폴더의 `README.md`에는 다음을 포함합니다.

```markdown
# 실험명

## 실험 목적

## 데이터

## 모델 구조

## 주요 설정

## 평가 지표

## 결과

## 해석

## 다음 실험 아이디어
```

## 5.5 모델 파일 관리

- [ ] 모델 파일명에는 모델명과 날짜를 포함한다.
- [ ] 가장 좋은 모델은 `best_model.pt` 또는 `best_model.pkl`로 저장한다.
- [ ] 모델 파일 경로는 설정 파일 또는 환경변수로 관리한다.
- [ ] 대용량 모델 파일은 GitHub에 올리지 않는다.
- [ ] 배포에 필요한 최종 모델만 따로 관리한다.
- [ ] 모델과 함께 label encoder, scaler, config도 함께 관리한다.

예시:

```text
ai-server/models/
├─ best_model.pt
├─ label_encoder.pkl
├─ scaler.pkl
└─ model_config.yaml
```

## 5.6 데이터 분할 규칙

- [ ] train, valid, test를 명확히 분리한다.
- [ ] test 데이터는 마지막 평가에만 사용한다.
- [ ] 같은 원본에서 나온 데이터가 train과 test에 동시에 들어가지 않도록 주의한다.
- [ ] 데이터 누수를 방지한다.
- [ ] 분할 기준을 문서화한다.
- [ ] scaler, encoder는 train 데이터로만 fit한다.
- [ ] valid, test에는 train에서 fit한 scaler, encoder만 적용한다.

## 5.7 평가 지표 규칙

분류 문제에서는 다음 지표를 기본으로 사용합니다.

- [ ] Accuracy
- [ ] Precision
- [ ] Recall
- [ ] F1-score
- [ ] Confusion Matrix

국방 감시·정찰 프로젝트에서는 다음 지표도 중요합니다.

- [ ] 미탐률
- [ ] 오탐률
- [ ] 위험 객체 Recall
- [ ] 클래스별 성능
- [ ] 추론 시간
- [ ] 모델 크기
- [ ] 배포 가능성

보안, 감시, 정찰 주제에서는 단순 정확도보다 **위험 객체를 놓치지 않는 것**이 중요합니다.

## 5.8 실험 기록 원칙

- [ ] 성능이 낮은 실험도 중요한 경우 기록한다.
- [ ] 좋은 결과만 남기지 않는다.
- [ ] 어떤 설정이 왜 실패했는지 기록한다.
- [ ] 실험 이름만 봐도 목적을 알 수 있게 작성한다.
- [ ] 결과 그래프와 수치 지표를 함께 남긴다.
- [ ] 발표에 사용할 수 있는 핵심 실험은 별도 표시한다.

---

# 6. 노트북 사용 규칙

Jupyter Notebook 또는 Google Colab은 실험용으로만 사용합니다.

## 6.1 기본 원칙

- [ ] 최종 서비스 코드는 `.py` 파일로 분리한다.
- [ ] 노트북에는 실험 목적을 적는다.
- [ ] 실행 순서가 꼬이지 않게 정리한다.
- [ ] 결과가 좋은 실험은 `ml/` 코드로 정리한다.
- [ ] 불필요한 출력은 정리한다.
- [ ] 노트북에서 모든 로직을 직접 작성하지 않고, 가능하면 `ml/` 모듈을 불러와 사용한다.
- [ ] 학습 결과는 GitHub 저장소가 아니라 Google Drive의 결과 저장 폴더에 저장한다.

## 6.2 노트북 파일명 규칙

```text
YYYY-MM-DD_{name}_{purpose}.ipynb
```

예시:

```text
2026-06-04_juyeong_audio_eda.ipynb
2026-06-05_juyeong_cnn_baseline.ipynb
2026-06-06_juyeong_model_comparison.ipynb
```

## 6.3 Colab 시작 코드

Colab 노트북은 처음 시작을 다음과 같이 합니다.

```python
# 1. Google Drive 연결
from google.colab import drive
drive.mount('/content/drive')

# 2. GitHub 코드 가져오기
!git clone https://github.com/YOUR_GITHUB_ORG/YOUR_REPOSITORY.git
%cd KDT_2026_Acorn_7th_2team_final_project

# 3. 패키지 설치
!pip install -r requirements.txt

# 4. GPU 확인
!nvidia-smi
```

## 6.4 Colab 결과 저장 경로

학습 결과는 Google Drive의 다음 경로 아래에 저장합니다.

```text
/content/drive/MyDrive/final_project/ml/runs/
```

Colab에서는 다음을 주의합니다.

- [ ] GitHub 저장소 안에 대용량 결과를 저장하지 않는다.
- [ ] Google Drive에 저장한 결과 중 필요한 요약만 GitHub 문서에 반영한다.
- [ ] 실험 결과를 로컬에만 두지 않는다.
- [ ] 팀원이 재현할 수 있도록 설정 파일과 실행 순서를 남긴다.

---

# 7. 웹 백엔드 규칙

웹 백엔드는 Spring Boot 또는 FastAPI를 사용할 수 있습니다.

## 7.1 API 설계 규칙

- [ ] API URL은 명확한 명사를 사용한다.
- [ ] 요청과 응답 형식은 문서화한다.
- [ ] 성공 응답과 실패 응답 형식을 통일한다.
- [ ] 파일 업로드 크기 제한을 둔다.
- [ ] 사용자 입력값은 반드시 검증한다.
- [ ] API를 추가하거나 변경하면 `docs/api_spec.md`를 갱신한다.

API 예시:

```http
POST /api/analyses
GET /api/analyses/{analysis_id}
GET /api/analyses
DELETE /api/analyses/{analysis_id}
```

## 7.2 응답 JSON 규칙

성공 응답 예시:

```json
{
  "success": true,
  "data": {
    "analysis_id": 1,
    "label": "drone",
    "confidence": 0.92,
    "risk_score": 85
  },
  "message": "분석이 완료되었습니다."
}
```

실패 응답 예시:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_FILE_TYPE",
    "message": "지원하지 않는 파일 형식입니다."
  }
}
```

## 7.3 백엔드 레이어 분리

가능하면 다음 구조를 사용합니다.

```text
controller / router  : 요청과 응답 처리
service              : 비즈니스 로직
repository / dao     : DB 접근
dto / schema         : 요청/응답 객체
entity / model       : DB 테이블 매핑
```

## 7.4 로그 규칙

- [ ] 요청 시작과 종료를 기록한다.
- [ ] 에러 발생 시 원인을 기록한다.
- [ ] 사용자에게는 민감한 내부 에러를 그대로 보여주지 않는다.
- [ ] 로그에는 비밀번호, 토큰, 개인정보를 남기지 않는다.
- [ ] 파일명, 사용자 ID 등 식별 가능 정보는 필요한 경우에만 기록한다.

---

# 8. AI 추론 서버 규칙

AI 추론 서버는 가능하면 FastAPI 기준으로 작성합니다.

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

## 8.1 추론 API 규칙

- [ ] 서버 시작 시 모델을 한 번만 로드한다.
- [ ] 요청마다 모델을 다시 로드하지 않는다.
- [ ] 업로드 파일 형식을 검증한다.
- [ ] 예측 결과에 confidence를 포함한다.
- [ ] 예측 실패 시 명확한 에러를 반환한다.
- [ ] 추론 시간을 반환한다.
- [ ] 모델 경로는 환경변수 또는 설정 파일로 관리한다.

예시:

```http
POST /predict
```

응답 예시:

```json
{
  "label": "drone",
  "confidence": 0.92,
  "risk_score": 85,
  "inference_time_ms": 123
}
```

## 8.2 AI 서버와 웹 백엔드 분리

- [ ] AI 서버는 모델 추론에 집중한다.
- [ ] 웹 백엔드는 사용자 요청, DB 저장, 이력 조회를 담당한다.
- [ ] AI 서버가 DB에 직접 접근하지 않도록 우선 설계한다.
- [ ] 웹 백엔드가 AI 서버 API를 호출하는 구조를 우선한다.
- [ ] 모델 교체가 웹 서비스 전체 구조를 깨지 않게 한다.

---

# 9. 프론트엔드 규칙

## 9.1 화면 구성 규칙

- [ ] 사용자가 해야 할 행동이 명확해야 한다.
- [ ] 업로드 중 상태를 보여준다.
- [ ] 분석 실패 시 에러 메시지를 보여준다.
- [ ] 분석 결과는 표, 카드, 그래프 등으로 명확히 보여준다.
- [ ] 대시보드에는 핵심 지표만 먼저 보여준다.
- [ ] API 경로는 한 곳에서 관리한다.
- [ ] 중복 컴포넌트는 공통 컴포넌트로 분리한다.

## 9.2 기본 화면

- [ ] 로그인 화면
- [ ] 파일 업로드 화면
- [ ] 분석 결과 화면
- [ ] 분석 이력 화면
- [ ] 대시보드 화면
- [ ] 관리자 화면

## 9.3 사용자 경험 기준

- [ ] 사용자가 다음 행동을 쉽게 알 수 있어야 한다.
- [ ] 로딩 상태가 표시되어야 한다.
- [ ] 에러 메시지는 사용자가 이해할 수 있어야 한다.
- [ ] 분석 결과는 한눈에 이해할 수 있어야 한다.
- [ ] 위험도나 confidence는 시각적으로 구분되면 좋다.

---

# 10. DB 규칙

## 10.1 테이블 작성 규칙

- [ ] 테이블명은 소문자와 언더스코어를 사용한다.
- [ ] 기본키는 `id`로 통일한다.
- [ ] 생성일은 `created_at`으로 통일한다.
- [ ] 수정일은 `updated_at`으로 통일한다.
- [ ] 삭제 여부가 필요하면 `deleted_at` 또는 `is_deleted`를 사용한다.
- [ ] 파일 자체는 DB에 직접 저장하지 않고 경로만 저장한다.
- [ ] DB 구조가 변경되면 `docs/db_schema.md`를 갱신한다.

예시:

```sql
CREATE TABLE analysis_history (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    result_label VARCHAR(100),
    confidence DOUBLE,
    risk_score INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 10.2 파일 저장 규칙

- [ ] 파일 자체는 DB에 넣지 않는다.
- [ ] DB에는 파일 경로와 메타데이터만 저장한다.
- [ ] 업로드 파일명은 중복되지 않게 UUID를 붙인다.
- [ ] 원본 파일명과 저장 파일명을 모두 기록한다.
- [ ] 업로드 파일의 저장 경로는 환경변수 또는 설정 파일로 관리한다.

## 10.3 DB 문서화 규칙

`docs/db_schema.md`에는 다음을 기록합니다.

- [ ] 테이블명
- [ ] 컬럼명
- [ ] 데이터 타입
- [ ] 기본키
- [ ] 외래키
- [ ] 인덱스
- [ ] 컬럼 설명
- [ ] 변경 이력

---

# 11. 환경변수와 보안 규칙

민감한 값은 `.env` 파일로 관리합니다.

## 11.1 `.env.example` 예시

`.env.example`에는 실제 비밀번호나 실제 API Key를 작성하지 않습니다.  
아래처럼 placeholder 형식으로 작성합니다.

```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=defense_project
DB_USER=<DB_USER>
DB_PASSWORD=<DB_PASSWORD>

MODEL_PATH=./ai-server/models/best_model.pt
UPLOAD_DIR=./uploads
```

## 11.2 `.gitignore` 필수 항목

`.gitignore`에는 다음 항목을 포함합니다.

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

## 11.3 보안 금지 사항

- [ ] 실제 `.env` 파일 업로드 금지
- [ ] DB 비밀번호 코드에 직접 작성 금지
- [ ] API Key 업로드 금지
- [ ] 토큰 업로드 금지
- [ ] 개인정보를 로그에 출력 금지
- [ ] 업로드 파일의 민감 정보를 무단 저장 금지
- [ ] 실제 운영 서버 정보 문서에 노출 금지

---

# 12. 테스트 규칙

## 12.1 최소 테스트 항목

- [ ] 파일 업로드가 되는가?
- [ ] 잘못된 파일 형식이 차단되는가?
- [ ] AI 서버가 정상 응답하는가?
- [ ] 분석 결과가 DB에 저장되는가?
- [ ] 분석 이력이 조회되는가?
- [ ] 프론트엔드에서 결과가 표시되는가?
- [ ] 배포 환경에서 실행되는가?

## 12.2 Python 테스트

가능하면 `pytest`를 사용합니다.

```text
tests/
├─ test_preprocess.py
├─ test_model_service.py
└─ test_api.py
```

## 12.3 테스트 작성 원칙

- [ ] 핵심 전처리 함수는 단위 테스트를 작성한다.
- [ ] 모델 로딩 함수는 테스트한다.
- [ ] API 응답 형식은 테스트한다.
- [ ] 파일 업로드 실패 케이스를 테스트한다.
- [ ] 테스트 방법은 README 또는 PR에 남긴다.

---

# 13. 배포 규칙

## 13.1 Docker 사용 권장

배포 환경에서는 Docker 사용을 권장합니다.

필수 확인 사항:

- [ ] 로컬에서 Docker로 실행 가능
- [ ] 백엔드 컨테이너 실행 가능
- [ ] AI 서버 컨테이너 실행 가능
- [ ] DB 컨테이너 실행 가능
- [ ] 프론트엔드와 백엔드 연결 가능
- [ ] 환경변수로 설정 변경 가능
- [ ] 모델 파일 경로 정상 연결

## 13.2 배포 전 체크리스트

- [ ] README 실행 방법 확인
- [ ] `.env.example` 최신화
- [ ] API 명세 최신화
- [ ] DB 스키마 최신화
- [ ] 샘플 데이터 포함 여부 확인
- [ ] 대용량 파일 GitHub 업로드 여부 확인
- [ ] 비밀번호/API Key 노출 여부 확인
- [ ] 최종 모델 파일 연결 확인
- [ ] 시연 시나리오 확인

---

# 14. 문서화 규칙

각 기능은 최소한 다음 중 하나에 기록합니다.

- [ ] `README.md`
- [ ] `docs/api_spec.md`
- [ ] `docs/db_schema.md`
- [ ] `docs/model_report.md`
- [ ] `docs/deploy_guide.md`
- [ ] `docs/meeting_notes.md`
- [ ] `docs/coding_rules.md`

## 14.1 README 필수 항목

README에는 다음 내용을 포함합니다.

- [ ] 프로젝트 소개
- [ ] 주요 기능
- [ ] 기술 스택
- [ ] 폴더 구조
- [ ] 설치 방법
- [ ] 실행 방법
- [ ] API 요약
- [ ] 팀원 역할
- [ ] 시연 방법
- [ ] 모델 성능 요약
- [ ] 배포 주소 또는 배포 방법

## 14.2 API 문서 필수 항목

`docs/api_spec.md`에는 다음을 포함합니다.

- [ ] API 경로
- [ ] HTTP Method
- [ ] 요청 파라미터
- [ ] 요청 예시
- [ ] 응답 예시
- [ ] 에러 코드
- [ ] 인증 필요 여부

## 14.3 모델 보고서 필수 항목

`docs/model_report.md`에는 다음을 포함합니다.

- [ ] 사용 데이터
- [ ] 전처리 방식
- [ ] 모델 구조
- [ ] 실험 설정
- [ ] 평가 지표
- [ ] 성능 결과
- [ ] 한계점
- [ ] 향후 개선 방향

---

# 15. 코드 리뷰 기준

리뷰어는 다음을 확인합니다.

- [ ] 코드가 목적에 맞게 동작하는가?
- [ ] 함수가 너무 길지 않은가?
- [ ] 중복 코드가 없는가?
- [ ] 변수명이 이해하기 쉬운가?
- [ ] 에러 처리가 되어 있는가?
- [ ] 민감 정보가 노출되지 않았는가?
- [ ] 실행 방법이 문서화되어 있는가?
- [ ] 테스트 또는 실행 결과가 있는가?
- [ ] API, DB 변경이 문서에 반영되었는가?
- [ ] 불필요한 대규모 구조 변경이 없는가?

---

# 16. 금지 사항

- [ ] `.env` 파일 업로드 금지
- [ ] DB 비밀번호 코드에 직접 작성 금지
- [ ] API Key 업로드 금지
- [ ] 토큰 업로드 금지
- [ ] 대용량 원본 데이터 업로드 금지
- [ ] 모델 파일을 무분별하게 GitHub에 업로드 금지
- [ ] 실행되지 않는 코드를 `develop` 또는 `main`에 병합 금지
- [ ] 출처 없는 데이터 사용 금지
- [ ] 실험 결과를 기록하지 않고 모델 교체 금지
- [ ] 요청 없이 전체 프로젝트 구조를 갈아엎기 금지
- [ ] 요청 없이 라이브러리 대량 변경 금지
- [ ] API 응답 형식 임의 변경 금지
- [ ] DB 컬럼명 임의 변경 금지

---

# 17. MVP 기준

최소 완성 기준은 다음과 같습니다.

- [ ] 사용자가 파일을 업로드할 수 있다.
- [ ] 서버가 파일을 저장할 수 있다.
- [ ] AI 서버가 파일을 분석할 수 있다.
- [ ] 분석 결과가 웹 화면에 표시된다.
- [ ] 분석 결과가 DB에 저장된다.
- [ ] 과거 분석 이력을 조회할 수 있다.
- [ ] 로컬에서 실행 가능하다.
- [ ] 배포 환경에서 실행 가능하다.
- [ ] README만 보고 실행할 수 있다.

## 17.1 MVP 이후 개선 항목

MVP 완료 후 다음 항목을 개선합니다.

- [ ] 사용자 인증
- [ ] 관리자 화면
- [ ] 분석 결과 대시보드
- [ ] 모델 성능 비교 화면
- [ ] 파일별 분석 이력 필터
- [ ] 모델 재학습 또는 모델 교체 구조
- [ ] 배포 자동화
- [ ] 로그 모니터링

---

# 18. 최종 제출 전 확인

최종 제출 전 다음을 확인합니다.

- [ ] 코드 정리 완료
- [ ] 불필요한 주석 삭제
- [ ] 미사용 파일 삭제
- [ ] README 최신화
- [ ] API 명세 최신화
- [ ] DB 설계서 최신화
- [ ] 모델 성능표 작성
- [ ] 테스트 결과 작성
- [ ] 배포 주소 확인
- [ ] 발표 자료와 실제 서비스 내용 일치 확인
- [ ] 시연 시나리오 작성
- [ ] 팀원 역할 정리
- [ ] 트러블슈팅 내용 정리
- [ ] 한계점과 개선 방향 정리

---

# 19. 좋은 작업 결과 기준

좋은 작업 결과는 다음 조건을 만족합니다.

- [ ] README만 보고 실행할 수 있다.
- [ ] 코드가 역할별로 분리되어 있다.
- [ ] 함수명과 변수명만 봐도 의도를 알 수 있다.
- [ ] 모델 학습 결과가 재현 가능하다.
- [ ] API 요청과 응답이 문서화되어 있다.
- [ ] DB 구조가 문서화되어 있다.
- [ ] Docker 또는 배포 환경에서 실행 가능하다.
- [ ] 팀원이 이어서 작업할 수 있다.
- [ ] 발표 자료에 사용할 수 있는 근거가 남아 있다.
- [ ] README만 보고도 프로젝트 관련 포트폴리오를 작성할 수 있다.
