# Frontend

드론 웹서비스 프론트엔드입니다.

## 기술 스택

- Vite
- React
- TypeScript
- React Router
- TanStack Query
- Zustand
- React Hook Form
- Zod

## 실행 방법

```bash
npm ci
npm run dev
```

## 검증

```bash
npm run lint
npm run build
```

## 환경변수

실제 값은 `.env`에 작성하고 Git에 포함하지 않습니다.

```text
VITE_API_BASE_URL=
VITE_WS_BASE_URL=
VITE_NAVER_MAP_CLIENT_ID=
```

## 규칙

- UI 용어는 `적진지`를 사용합니다.
- 서버 데이터는 TanStack Query에서 관리합니다.
- Zustand에는 UI 상태만 저장합니다.
- API 호출 코드는 `src/api/`에서 관리합니다.
- 백엔드 계약 전 임시 데이터에는 `TEMP_FRONTEND_MOCK`을 표시합니다.
- 지도 라이브러리는 팀 결정 전까지 설치하지 않습니다.
