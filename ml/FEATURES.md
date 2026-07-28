# ML 기능별 구조

## 코드 구조

```text
ml/
  scripts/
    index_video_embeddings.py      # 영상에서 프레임/object 임베딩 생성
    ask_video_ollama.py            # 임베딩 검색 후 Ollama 답변 생성
    cluster_video_embeddings.py    # 비지도 클러스터링과 라벨링 리포트 생성
    build_video_graph.py           # metadata 기반 Graph RAG 그래프 생성
    ask_video_graph_rag.py         # 벡터 검색 + 그래프 관계로 LLM 답변 생성
  utils/
    video_object_embedding_pipeline.py  # 탐지, 추적, crop, CLIP 임베딩 저장
    video_embedding_search.py           # 임베딩 검색, HTML 검색 결과 리포트
    ollama_client.py                    # Ollama API 호출
  clustering/
    video_embedding_clustering.py       # KMeans 클러스터링, 대표 이미지, 라벨 템플릿
  graph_rag/
    video_graph.py                      # video/frame/object/track/label 그래프 생성
    llm_clients.py                      # Ollama 및 OpenAI 호환 외부 API 호출
```

## 산출물 구조

임베딩 실행 결과는 한 run 폴더 아래에 기능별로 모입니다.

```text
data/processed/video_embeddings/
  sample_ab12cd34/
    metadata.jsonl
    summary.json
    frames/
    crops/
      person/
      car/
      unknown/
    embeddings/
    clusters/
      cluster_assignments.jsonl
      cluster_summary.json
      cluster_labels.template.json
      cluster_report.html
    graph/
      graph_nodes.jsonl
      graph_edges.jsonl
      graph_summary.json
```

## 클러스터링 실행

run 폴더 하나를 클러스터링할 수 있습니다.

```powershell
python KDT_2026_Acorn_7th_2team_final_project/ml/scripts/cluster_video_embeddings.py `
  --input-dir KDT_2026_Acorn_7th_2team_final_project/data/processed/video_embeddings/sample_ab12cd34 `
  --num-clusters 8 `
  --item-type frame
```

상위 `video_embeddings` 폴더를 주면 하위 `metadata.jsonl`을 재귀적으로 모아 함께 클러스터링합니다.

```powershell
python KDT_2026_Acorn_7th_2team_final_project/ml/scripts/cluster_video_embeddings.py `
  --input-dir KDT_2026_Acorn_7th_2team_final_project/data/processed/video_embeddings `
  --num-clusters 12 `
  --item-type object
```

## 라벨링 흐름

1. `cluster_report.html`에서 클러스터별 대표 프레임을 확인합니다.
2. `cluster_labels.template.json`의 `label`과 `description`을 채웁니다.
3. 라벨을 이후 이벤트 검색, Graph RAG 컨텍스트, 이벤트별 영상 컷 기준으로 사용합니다.

## 객체 crop 저장 구조

객체 crop 이미지는 YOLO 라벨명을 기준으로 폴더가 나뉩니다. 라벨이 비어 있거나 폴더명으로 쓸 수 없으면 `unknown` 폴더에 저장합니다.

```text
crops/
  person/
    frame_000120_object_000_track_3.jpg
  car/
    frame_000120_object_001_track_7.jpg
  unknown/
    frame_000120_object_002_track_unknown.jpg
```

이 구조는 나중에 crop 이미지를 직접 확인하거나, 더 세분화된 분류 라벨을 추가할 때 데이터셋처럼 사용할 수 있습니다.

## Graph RAG 구축

임베딩 metadata를 그래프 노드와 엣지로 변환합니다.

영상 임베딩과 Graph RAG 그래프를 한 번에 만들려면 임베딩 명령에 `--build-graph`를 붙입니다.

```powershell
python KDT_2026_Acorn_7th_2team_final_project/ml/scripts/index_video_embeddings.py `
  --video KDT_2026_Acorn_7th_2team_final_project/data/raw/sample.mp4 `
  --output-dir KDT_2026_Acorn_7th_2team_final_project/data/processed/video_embeddings `
  --detector-model yolov8n.pt `
  --device cuda `
  --build-graph
```

그러면 생성된 run 폴더 아래에 `metadata.jsonl`, `embeddings/`, `graph/`가 함께 만들어집니다.

이미 임베딩이 끝난 run 폴더에 그래프만 추가로 만들 수도 있습니다.

```powershell
python KDT_2026_Acorn_7th_2team_final_project/ml/scripts/build_video_graph.py --input-dir KDT_2026_Acorn_7th_2team_final_project/data/processed/video_embeddings/sample_ab12cd34
```

생성되는 기본 관계는 다음과 같습니다.

```text
video -contains_frame-> frame
frame -contains_object-> object
object -has_label-> label
object -belongs_to_track-> track
track -observed_as-> object
object -next_observation-> object
object -near/overlaps-> object
```

벡터 검색 결과 주변의 그래프 관계까지 함께 LLM에 전달하려면 다음처럼 실행합니다.

```powershell
python KDT_2026_Acorn_7th_2team_final_project/ml/scripts/ask_video_graph_rag.py --run-dir KDT_2026_Acorn_7th_2team_final_project/data/processed/video_embeddings/sample_ab12cd34   --query "차량 근처에 있던 사람은 이후 어디로 이동했어?" --llm-provider ollama --llm-url http://localhost:11434 --llm-model llama3.1
```

외부 API를 쓰고 싶으면 OpenAI 호환 엔드포인트를 지정할 수 있습니다.

```powershell
python KDT_2026_Acorn_7th_2team_final_project/ml/scripts/ask_video_graph_rag.py --run-dir KDT_2026_Acorn_7th_2team_final_project/data/processed/video_embeddings/sample_ab12cd34   --query "사람과 차량의 관계를 설명해줘" --llm-provider openai-compatible --llm-url https://api.example.com --llm-model model-name --llm-api-key YOUR_API_KEY
```

Gemini API를 직접 쓰려면 Google AI Studio에서 발급한 API key를 넘깁니다.

```powershell
python KDT_2026_Acorn_7th_2team_final_project/ml/scripts/ask_video_graph_rag.py --run-dir KDT_2026_Acorn_7th_2team_final_project/data/processed/video_embeddings/sample_ab12cd34   --query "사람과 차량의 관계를 설명해줘" --llm-provider gemini --llm-url https://generativelanguage.googleapis.com --llm-model gemini-3.5-flash --llm-api-key YOUR_GEMINI_API_KEY
```

## Qwen2.5-VL 행동 설명 벡터화

객체 `track_id`별 대표 프레임을 Qwen2.5-VL-7B-Instruct에 넣어 행동 설명을 만들고, 그 설명 텍스트를 다시 임베딩으로 저장합니다.

```powershell
python KDT_2026_Acorn_7th_2team_final_project/ml/scripts/analyze_video_actions.py --run-dir KDT_2026_Acorn_7th_2team_final_project/data/processed/video_embeddings/sample_ab12cd34  --model-name Qwen/Qwen2.5-VL-7B-Instruct --device cuda --image-source frame  --max-frames-per-track 6
```

생성 결과는 다음과 같습니다.

```text
action_events.jsonl
action_embeddings/
  sample_action_person_track_1.npy
```

`action_events.jsonl`에는 행동 설명, 시작/끝 frame, timestamp, evidence image, text embedding 경로가 들어갑니다. 행동 분석 후 그래프를 다시 생성하면 action event도 Graph RAG 관계에 포함됩니다.

```powershell
python KDT_2026_Acorn_7th_2team_final_project/ml/scripts/build_video_graph.py --input-dir KDT_2026_Acorn_7th_2team_final_project/data/processed/video_embeddings/sample_ab12cd34
```
