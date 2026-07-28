# 연남동 위성 이미지 FAISS 인덱싱

## 데이터 흐름

`로컬 PNG/meta.csv → MinIO datasets 버킷 → Game4Loc 임베딩 → FAISS → PostgreSQL 메타데이터`

FAISS에는 정규화된 768차원 벡터와 정수 ID가 저장됩니다. PostgreSQL의
`image_embeddings.faiss_vector_id`가 해당 ID를 `satellite_images`의 MinIO 경로 및
위·경도와 연결합니다. 실제 이미지 원본은 MinIO의
`datasets/satellite/yeonnam/` 아래에 저장됩니다.

## 실행

컨테이너가 호스트의 다운로드 폴더를 볼 수 없으므로 아래 명령은 백엔드 컨테이너가
아닌 호스트 Python 환경에서 실행합니다. `.env`의 MinIO/PostgreSQL 주소도 호스트에서
접근 가능한 `localhost:9000`, `localhost:5432`로 지정해야 합니다.

```powershell
pip install -r requirements.txt
$env:DATABASE_URL='postgresql+psycopg://app_user:change_me@localhost:5432/drone_platform'
$env:MINIO_ENDPOINT='localhost:9000'
$env:GAMELOC_SOURCE_DIR='C:\AI\GTA-UAV\Game4Loc'
$env:GAMELOC_CHECKPOINT_PATH='C:\AI\best_e16_r1_30.2966.pth'
python -m scripts.index_satellite_images 'C:\path\to\satellite-images' --batch-size 16
```

Game4Loc은 `vit_base_patch16_rope_reg1_gap_256.sbb_in1k`, 입력 256×256 및 체크포인트의
모델 출력을 L2 정규화해 사용합니다. CPU에서는 1,642장 처리가 오래 걸릴 수 있습니다. CUDA가 설치된 환경에서는 자동으로
GPU를 사용합니다. 재실행 시 해당 FAISS 인덱스의 임베딩 매핑은 새 결과로 교체되고,
위성 이미지/MinIO 객체는 같은 경로로 갱신됩니다.

## 검색

```powershell
curl.exe -X POST 'http://localhost:8000/api/faiss/search/image?topK=5' `
  -F 'file=@query.png'
```

응답의 각 항목에는 `score`(코사인 유사도), `faissId`, `objectKey`, `latitude`,
`longitude`가 포함됩니다. 상태는 `GET /api/faiss/status`에서 확인할 수 있습니다.

주의: 인덱스 생성과 검색 서버는 같은 `storage/faiss` 파일을 봐야 합니다. Docker
Compose의 `faiss_data` 볼륨 안에서 운용한다면 호스트에서 생성한 파일을 컨테이너로
복사하거나, 소스 이미지 폴더를 컨테이너에 마운트한 뒤 컨테이너 안에서 배치 명령을
실행하세요.
