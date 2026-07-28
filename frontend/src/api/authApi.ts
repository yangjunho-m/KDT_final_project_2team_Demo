import { apiClient } from "./apiClient";

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  roles: string[];
};

export type LoginRequest = {
  username: string;
  password: string;
};

export type LoginResponse = {
  user: AuthUser;
  accessToken: string;
  tokenType: string;
  expiresAt: string;
  subject: string;
  redirectPath: string;
};

export function login(input: LoginRequest): Promise<LoginResponse> {
  return apiClient.post<LoginResponse, LoginRequest>("/api/auth/login", input, {
    skipAuth: true,
    skipUnauthorizedHandler: true,
  });
}

export function getCurrentUser(): Promise<AuthUser> {
  return apiClient.get<AuthUser>("/api/auth/me");
}

export function logout(): Promise<{ revoked: boolean }> {
  return apiClient.post<{ revoked: boolean }>("/api/auth/logout");
}
