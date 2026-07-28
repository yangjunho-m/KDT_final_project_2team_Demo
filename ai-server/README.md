# AI 서버

동영상을 인덱싱하고 자연어로 검색하기 위한 AI 서버입니다.

이 서버는 provider 기반 구조로 되어 있어, 같은 API를 유지하면서 내부 AI 처리 방식을 바꿀 수 있습니다.

- `dummy`: 모델 없이 API 흐름을 테스트하기 위한 가벼운 기본 모드
- `local`: 로컬 임베딩, 로컬 객체 탐지, 로컬 LLM 사용
- `external`: 외부 HTTP API provider 호출

## 실행 방법

```powershell
cd ai-server
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Provider 모드

환경변수를 따로 설정하지 않으면 `dummy` 모드로 동작합니다.

로컬 모드 예시:

```text
AI_PROVIDER_MODE=local
EMBEDDING_PROVIDER=local
DETECTOR_PROVIDER=local
LLM_PROVIDER=local
LOCAL_EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
LOCAL_DETECTOR_MODEL=yolov8n.pt
LOCAL_LLM_MODEL_PATH=ai-server/models/llm.gguf
```

외부 API 모드 예시:

```text
AI_PROVIDER_MODE=external
EMBEDDING_PROVIDER=external
DETECTOR_PROVIDER=external
LLM_PROVIDER=external
EXTERNAL_EMBEDDING_URL=http://localhost:9001/embed
EXTERNAL_DETECTOR_URL=http://localhost:9002/detect
EXTERNAL_LLM_URL=http://localhost:9003/generate
EXTERNAL_API_KEY=
```

Provider는 서로 섞어서 사용할 수 있습니다. 예를 들어 객체 탐지는 로컬 YOLO를 쓰고, LLM만 외부 API를 쓰는 식입니다.

```text
AI_PROVIDER_MODE=dummy
EMBEDDING_PROVIDER=local
DETECTOR_PROVIDER=local
LLM_PROVIDER=external
```

## API

동영상 인덱싱:

```powershell
curl.exe -X POST "http://localhost:8000/api/v1/videos/index" -F "file=@sample.mp4"
```

자연어 검색:

```powershell
curl.exe -X POST "http://localhost:8000/api/v1/videos/search" `
  -H "Content-Type: application/json" `
  -d "{\"query\":\"person near vehicle\",\"top_k\":5}"
```

## 저장되는 정보

인덱싱 결과에는 다음 정보가 포함됩니다.

- `video_id`: 동영상 ID
- `timestamp_seconds`: 영상 내 시간
- `item_type`: `scene` 또는 `object`
- `text`: 장면 또는 객체 설명 텍스트
- `object_label`: 탐지된 객체 이름
- `bbox`: 객체 위치 좌표
- `frame_path`: 추출된 프레임 이미지 경로
- `crop_path`: 객체 크롭 이미지 경로

## 처리 흐름

```text
동영상 업로드
-> 프레임 추출
-> 객체 탐지
-> 객체 영역 크롭
-> 장면 설명 생성
-> 장면/객체 텍스트 임베딩
-> 벡터 저장
-> 자연어 검색
```

현재 벡터 저장소는 개발용 JSON 파일 기반입니다. 운영 단계에서는 `FAISS`, `Qdrant`, `Milvus`, `pgvector` 같은 벡터 DB로 교체하는 것을 권장합니다.
