# Drone View Dataset Seed

MinIO `datasets` 버킷에 저장된 `metadata.csv`를 기준으로 작전지역, 드론, 시나리오 템플릿을 DB에 자동 생성하는 기능입니다.

## 사용 목적

프론트에서 사용자가 직접 작전지역과 드론을 만들기 전에, CSV 데이터셋 기준의 시연 데이터를 바로 불러올 수 있도록 합니다.

## 활성화

서버 `.env`에 아래 값을 추가하거나 수정합니다.

```env
SEED_DRONE_VIEW_DATASET=true
DRONE_VIEW_OPERATION_AREA_ID=AREA-DATASET-001
DRONE_VIEW_OPERATION_AREA_NAME=CSV 기반 시연 작전지역
```

기존 드론뷰 CSV 경로도 맞아야 합니다.

```env
MINIO_BUCKET_DATASETS=datasets
DRONE_VIEW_DATASET_PREFIX=demo-drone-surveillance-route/drone-route
DRONE_VIEW_METADATA_FILE=metadata.csv
DRONE_VIEW_SIMULATION_FILE=drone_surveillance_simulation.csv
```

## 생성되는 데이터

### 작전지역

`metadata.csv`에 작전지역 이름, 중심 좌표, 반경 컬럼이 있으면 해당 값을 사용합니다.

없으면 CSV 전체 좌표를 기준으로 자동 계산합니다.

- 이름: `CSV 기반 시연 작전지역 - {scenario_type}`
- 위도/경도: CSV 좌표들의 중심점
- 반경: 중심점에서 가장 먼 프레임까지의 거리 + 300m, 최소 500m

### 드론

CSV의 `drone_id` 기준으로 최대 2대를 생성합니다.

우선 생성 대상:

```text
DRONE_A
DRONE_B
```

각 드론은 다음 값을 가집니다.

- 출발 좌표: 해당 드론의 첫 번째 프레임 좌표
- 현재 좌표: 해당 드론의 첫 번째 프레임 좌표
- 이동 목표 좌표: 해당 드론의 마지막 프레임 좌표
- 상태: `MOVING`
- 신호 상태: `NORMAL`

### 시나리오 템플릿

CSV의 `scenario_type`을 기준으로 템플릿을 생성합니다.

지원 타입:

```text
NORMAL
JAMMING
SPOOFING
```

예시:

```text
STP-DATASET-NORMAL
STP-DATASET-JAMMING
STP-DATASET-SPOOFING
```

현재 첨부된 `metadata.csv`는 `scenario_type=NORMAL`이므로 `CSV NORMAL 경로 시나리오` 템플릿이 생성됩니다.

## 확인 API

작전지역 목록:

```http
GET /api/operation-areas
```

작전지역 snapshot:

```http
GET /api/operation-areas/AREA-DATASET-001/snapshot
```

시나리오 템플릿 목록:

```http
GET /api/scenario-templates
```

드론뷰 전체 경로:

```http
GET /api/drone-view/routes
```
