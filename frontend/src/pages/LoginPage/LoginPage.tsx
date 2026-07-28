import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ApiError } from "../../api/apiClient";
import { useLoginMutation } from "../../features/auth";
import { BrandLogo, PrimaryButton } from "../../shared/components";
import { useAuthStore } from "../../stores";
import "./login.css";

const allowedRedirectPaths = new Set([
  "/reports",
  "/operation",
  "/scenario",
]);

function getSafeRedirectPath(redirectPath: string | undefined) {
  if (!redirectPath || !allowedRedirectPaths.has(redirectPath)) {
    return "/operation";
  }
  return redirectPath;
}

export function LoginPage() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const loginMutation = useLoginMutation();

  if (isAuthenticated && !loginMutation.isPending) {
    return <Navigate to="/operation" replace />;
  }

  const canSubmit =
    username.trim().length > 0 &&
    password.trim().length > 0 &&
    !loginMutation.isPending;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    loginMutation.mutate(
      {
        username: username.trim(),
        password,
      },
      {
        onSuccess: (data) => {
          navigate(getSafeRedirectPath(data.redirectPath), { replace: true });
        },
      },
    );
  };

  const errorMessage =
    loginMutation.error instanceof ApiError
      ? loginMutation.error.message
      : loginMutation.error
        ? "로그인 요청에 실패했습니다."
        : null;

  return (
    <div className="login-page">
      <header className="login-topbar">
        <BrandLogo size={40} />
        <div className="login-topbar__text">
          <span className="login-topbar__title">드론 통합 운용 플랫폼</span>
          <span className="login-topbar__subtitle">
            DRONE INTEGRATED OPERATIONS PLATFORM
          </span>
        </div>
      </header>

      <div className="login-card">
        <div className="login-brand">
          <BrandLogo size={48} />
          <h1 className="login-brand__title">로그인</h1>
          <p className="login-brand__subtitle">
            드론 통합 운용 플랫폼에 오신 것을 환영합니다.
          </p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label className="ui-field__label" htmlFor="login-username">
              아이디
            </label>
            <div className="login-input">
              <span className="login-input__icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle
                    cx="12"
                    cy="8"
                    r="3.4"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M5 19.5c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <input
                id="login-username"
                className="ui-field__control login-input__control"
                placeholder="아이디를 입력하세요"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
          </div>

          <div className="login-field">
            <label className="ui-field__label" htmlFor="login-password">
              비밀번호
            </label>
            <div className="login-input">
              <span className="login-input__icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <rect
                    x="5"
                    y="10.5"
                    width="14"
                    height="9"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M8 10.5V8a4 4 0 0 1 8 0v2.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                </svg>
              </span>
              <input
                id="login-password"
                className="ui-field__control login-input__control"
                type="password"
                placeholder="비밀번호를 입력하세요"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
          </div>

          <PrimaryButton
            type="submit"
            block
            className="login-submit"
            disabled={!canSubmit}
          >
            {loginMutation.isPending ? "로그인 중..." : "로그인"}
          </PrimaryButton>
          {errorMessage ? (
            <p className="login-error" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </form>

        <p className="login-footer">
          <span aria-hidden="true">●</span>
          로그인에 성공하면 메인 화면으로 이동합니다.
        </p>
      </div>
    </div>
  );
}
