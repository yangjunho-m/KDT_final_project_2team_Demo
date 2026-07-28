# 프론트엔드 전달용 로그인 연동 가이드

## 백엔드 접속 정보

- 운영 시연 주소: `http://example.com`
- 로그인 API: `POST http://example.com/api/auth/login`
- 사용자 확인 API: `GET http://example.com/api/auth/me`
- 로그인 성공 후 이동: `/operation`

## 시연 계정

```text
id: admin
password: admin
```

## 로그인 요청 예시

```ts
const response = await fetch("http://example.com/api/auth/login", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    username: "admin",
    password: "admin",
  }),
});

const body = await response.json();
```

## 로그인 성공 처리

```ts
if (body.success) {
  localStorage.setItem("accessToken", body.data.accessToken);
  window.location.href = body.data.redirectPath;
}
```

## 인증 헤더

로그인 이후 API 요청에는 다음 헤더를 포함한다.

```text
Authorization: Bearer {accessToken}
```

## 에러 처리

아이디 또는 비밀번호가 틀리면 HTTP 401과 함께 다음 형식이 내려온다.

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
