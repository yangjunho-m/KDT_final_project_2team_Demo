# Frontend agent instructions

작업 전에 아래 문서를 읽는다.

- ../AGENTS.md
- ../README.md
- ../coding_rules_clean_code_deeplearning_web.md
- ../team_project_coding_checklist.md
- ../docs/frontend/09_frontend_architecture.md
- ../docs/frontend/FRONTEND_RULES.md
- ../docs/frontend/TASKS.md

핵심 규칙:
- UI 용어는 `적진지`.
- 신규 적진지는 드론 0대.
- 최초 지도에는 적진지 중심 마커만 표시.
- 적진지별 드론 최대 2대.
- 드론 등록 시 출발 위도·경도·고도 필수.
- 드론 제거는 영구삭제가 아니라 `배정 해제`.
- 이미지 미등록/실패 시 기본 마커.
- 서버 데이터는 TanStack Query.
- Zustand는 UI 상태만 관리.
- API는 `src/api/` 한 곳에서 관리.
- 백엔드 미확정 데이터는 `TEMP_FRONTEND_MOCK`.

명시적 요청 없이 수정 금지:
- ../backend/
- ../ai-server/
- ../ml/
- ../data/
- ../deploy/

금지:
- `frontend/frontend/` 생성
- 지도 라이브러리 임의 설치
- 서버 데이터를 Zustand에 중복 저장
- 기능 명세에 없는 목표 좌표 지정/표적 탐지 시작 버튼 추가

완료 기준:
- npm run lint 성공
- npm run build 성공
- TypeScript 오류 없음
