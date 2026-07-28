# 인증 계약

## 목적

시연 단계에서는 PostgreSQL에 저장된 단일 관리자 계정으로 로그인한다.

- 아이디: `admin`
- 비밀번호: `admin`
- 로그인 성공 후 프론트 이동 경로: `/operation`

비밀번호는 DB에 평문으로 저장하지 않고 서버 시작 시 해시로 저장한다.

## 기본 주소

- Oracle Cloud 백엔드 주소: `http://example.com`
- API prefix: `/api`
- Swagger: `http://example.com/docs`

## 로그인

`POST /api/auth/login`

요청:

```json
{
  "username": "admin",
  "password": "admin"
}
```

성공 응답:

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "USR-001",
      "username": "admin",
      "displayName": "시연 관리자",
      "roles": ["ADMIN"]
    },
    "accessToken": "example-token",
    "tokenType": "bearer",
    "expiresAt": "2026-06-30T10:30:00Z",
    "subject": "admin",
    "redirectPath": "/operation"
  },
  "message": "요청이 성공했습니다."
}
```

실패 응답:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "아이디 또는 비밀번호가 올바르지 않습니다.",
    "details": {},
    "timestamp": "2026-07-01T00:00:00Z"
  }
}
```

## 현재 사용자 확인

`GET /api/auth/me`

요청 헤더:

```text
Authorization: Bearer {accessToken}
```

성공 응답:

```json
{
  "success": true,
  "data": {
    "id": "USR-001",
    "username": "admin",
    "displayName": "시연 관리자",
    "roles": ["ADMIN"]
  },
  "message": "요청이 성공했습니다."
}
```

## 로그아웃

`POST /api/auth/logout`

현재 서버는 무상태 토큰을 사용하므로 프론트에서 저장한 토큰을 삭제하면 된다.

## 프론트 전달 사항

- 로그인 화면에서 `POST http://example.com/api/auth/login`을 호출한다.
- 성공하면 `data.accessToken`을 저장하고 `data.redirectPath` 값인 `/operation`으로 이동한다.
- 이후 보호된 API를 호출할 때 `Authorization: Bearer {accessToken}` 헤더를 포함한다.
- CORS 허용 기본값에는 `http://localhost:3000`, `http://localhost:5173`, `http://example.com`가 포함되어 있다.
