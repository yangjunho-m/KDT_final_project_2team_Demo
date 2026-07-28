# DB·ERD 설계 초안

## 핵심 원칙

- 이미지와 영상 바이너리는 DB에 저장하지 않고 MinIO object key만 저장합니다.
- 최신 드론 상태는 `drone_states`에 UPSERT합니다.
- 위치 이력과 이벤트는 저장 주기를 제한합니다.
- 위치 검색이 필요한 좌표, 경로, 표적에는 PostGIS geometry를 검토합니다.

## 테이블 후보

- `users`
- `drones`
- `drone_states`
- `drone_state_history`
- `routes`
- `datasets`
- `frame_metadata`
- `saved_coordinates`
- `scenarios`
- `scenario_effects`
- `scenario_sessions`
- `targets`
- `inference_jobs`
- `inference_results`
- `reports`
- `report_attachments`
- `events`

## 인덱스 후보

- `drone_states.drone_id`
- `drone_state_history(drone_id, created_at desc)`
- `reports(status, important, created_at desc)`
- `saved_coordinates(position_geom)`
- `events(sequence)`
- `inference_jobs(status, created_at)`
