import { ApiError } from "../../api/apiClient";

/** 뮤테이션 에러를 사용자용 메시지로 변환한다 (ApiError면 서버 메시지, 아니면 폴백). */
export function getMutationErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    return error.message;
  }
  return fallback;
}

/** 재시도·중복 요청 구분용 클라이언트 요청 식별자 */
export function createClientRequestId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
