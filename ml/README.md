# ML 파이프라인

동영상을 입력받아 객체를 탐지/추적하고, 전체 프레임과 객체 crop 이미지를 각각 임베딩하는 파이프라인입니다.

현재 구현 범위:

- 동영상 프레임 읽기
- YOLO 기반 객체 탐지
- ByteTrack 기반 객체 추적 ID 생성
- 전체 프레임 이미지 저장
- 객체 bbox 기준 crop 이미지 저장
- CLIP 이미지 임베딩 생성
- 각 임베딩을 `.npy` 파일로 저장
- 검색/DB 적재에 사용할 `metadata.jsonl` 생성

## 설치

```powershell
pip install -r ml/requirements.txt
```

CUDA 환경에서 GPU용 PyTorch가 필요하면 PyTorch 공식 설치 명령으로 먼저 설치한 뒤 나머지 패키지를 설치하세요.

## 실행

옵션으로 실행:

```powershell
python ml/scripts/index_video_embeddings.py `
  --video data/sample/sample.mp4 `
  --output-dir data/processed/video_embeddings `
  --detector-model yolov8n.pt `
  --tracker-config bytetrack.yaml `
  --clip-model ViT-B-32 `
  --clip-pretrained openai `
  --device auto `
  --frame-sample-seconds 0.3 `
  --confidence-threshold 0.25
```

설정 파일로 실행:

```powershell
python KDT_2026_Acorn_7th_2team_final_project/ml/scripts/index_video_embeddings.py --config KDT_2026_Acorn_7th_2team_final_project/ml/configs/video_object_embedding_example.json
```

## 주요 옵션

- `--video`: 입력 동영상 경로
- `--output-dir`: 결과 저장 경로
- `--detector-model`: YOLO 모델 경로 또는 모델 이름
- `--tracker-config`: Ultralytics tracker 설정 파일 이름
- `--clip-model`: CLIP 모델 이름
- `--clip-pretrained`: CLIP pretrained weight 이름
- `--device`: `auto`, `cpu`, `cuda`, `cuda:0` 등
- `--frame-sample-seconds`: 몇 초마다 프레임을 1개씩 처리할지 결정. 기본값은 `0.3`초입니다.
- `--confidence-threshold`: 객체 탐지 confidence 기준
- `--no-save-frames`: 전체 프레임 이미지 저장 생략
- `--no-save-crops`: 객체 crop 이미지 저장 생략

## 결과 구조

```text
data/processed/video_embeddings/
  sample_ab12cd34/
    frames/
      frame_000000.jpg
    crops/
      frame_000000_object_000.jpg
    embeddings/
      sample_frame_000000_full.npy
      sample_object_000000_person_1.npy
    metadata.jsonl
    summary.json
```

`metadata.jsonl`의 각 줄은 하나의 임베딩 레코드입니다.

```json
{
  "record_id": "sample_object_000000_person_1",
  "video_id": "sample",
  "item_type": "object",
  "frame_index": 0,
  "timestamp_seconds": 0.0,
  "image_path": "data/processed/video_embeddings/sample_ab12cd34/crops/frame_000000_object_000.jpg",
  "embedding_path": "data/processed/video_embeddings/sample_ab12cd34/embeddings/sample_object_000000_person_1.npy",
  "label": "person",
  "confidence": 0.91,
  "track_id": 1,
  "bbox_xyxy": [10, 20, 120, 240]
}
```

## 다음 단계

생성된 `metadata.jsonl`과 `.npy` 임베딩을 벡터 DB에 적재하면 자연어 검색 API에서 사용할 수 있습니다. 전체 프레임 임베딩은 장면 검색에, 객체 crop 임베딩은 특정 객체 검색에 사용합니다.

## Ollama 연결

생성된 임베딩을 검색한 뒤, 검색 결과를 Ollama LLM에 넘겨 답변을 만들 수 있습니다.

먼저 Ollama가 실행 중인지 확인합니다.

```powershell
ollama list
```

모델이 없다면 예를 들어 다음처럼 받을 수 있습니다.

```powershell
ollama pull llama3.1
```

영상 임베딩 결과 폴더를 지정해 질문합니다.

```powershell
python KDT_2026_Acorn_7th_2team_final_project/ml/scripts/ask_video_ollama.py --run-dir KDT_2026_Acorn_7th_2team_final_project\data\processed\video_embeddings\dog_shorts_eaf015ec --query "강아지가 몇마리 나오는지 확인해줘" --top-k 5 --ollama-model llama3.1
```

객체 crop 결과만 보고 싶으면:

```powershell
python KDT_2026_Acorn_7th_2team_final_project/ml/scripts/ask_video_ollama.py `
  --run-dir KDT_2026_Acorn_7th_2team_final_project/data/processed/video_embeddings/sample_ab12cd34 `
  --query "차량 근처의 사람" `
  --item-type object `
  --ollama-model llama3.1
```

검색된 벡터 정보를 JSON으로 먼저 확인하고 싶으면 `--json`을 추가합니다.

```powershell
python KDT_2026_Acorn_7th_2team_final_project/ml/scripts/ask_video_ollama.py `
  --run-dir KDT_2026_Acorn_7th_2team_final_project/data/processed/video_embeddings/sample_ab12cd34 `
  --query "차량" `
  --json
```

Ollama에 전달되는 컨텍스트에는 timestamp, 객체 label, track id, similarity score, 임베딩 차원, 임베딩 norm, 임베딩 preview가 포함됩니다. 전체 벡터를 LLM에 그대로 넣지는 않습니다. 전체 벡터는 `.npy` 파일에 저장되어 있고, LLM에는 검색 근거로 필요한 요약 정보만 전달합니다.
