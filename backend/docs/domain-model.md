# 도메인 모델

| 도메인 | 역할 | 현재/이력 | 보존 |
|---|---|---|---|
| User | 사용자와 권한 | 현재 | 계정 정책 따름 |
| Drone | 드론 기본 정보 | 현재 | 비활성 soft delete |
| DroneState | 최신 항법 상태 | 현재 | UPSERT |
| Route | 계획 경로 | 기준 데이터 | 장기 보존 |
| Dataset | V-World 데이터셋 | 기준 데이터 | 자동 삭제 안 함 |
| FrameMetadata | 프레임 인덱스와 telemetry | 기준 데이터 | 데이터셋과 동일 |
| SavedCoordinate | 프론트 저장 좌표 | 현재 | soft delete |
| Scenario | 시나리오 템플릿 | 현재 | soft delete |
| ScenarioEffect | 재밍·스푸핑 조건 | 이력 | 30일 검토 |
| ScenarioSession | 실행 세션 | 이력 | 30일 검토 |
| Target | 표적 상태 | 현재/이력 | 30일 검토 |
| InferenceJob | Cross-view 작업 | 이력 | 30일 검토 |
| InferenceResult | 모델 결과 | 이력 | 30일 검토 |
| Report | 지휘 보고 | 이력 | 90일 또는 pinned 보존 제안 |
| ReportAttachment | 보고 첨부 메타데이터 | 이력 | 보고서 정책 따름 |
| Event | WebSocket 이벤트 로그 | 이력 | 30일 검토 |

위치 필드는 `plannedPosition`, `actualPosition`, `reportedGnssPosition`, `crossViewPosition` 네 가지를 분리합니다.
