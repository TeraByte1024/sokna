export const IDENTITY_LINK_COOKIE = "sokna-identity-link";
export const IDENTITY_LINK_MAX_AGE = 600;

export type IdentityLinkContext = {
  userId: string;
  nonce: string;
  createdAt: number;
};

export function readIdentityLinkContext(value: string | undefined): IdentityLinkContext | null {
  if (!value) return null;
  try {
    const context = JSON.parse(value);
    if (
      typeof context?.userId !== "string" || !context.userId ||
      typeof context.nonce !== "string" || !context.nonce ||
      typeof context.createdAt !== "number" ||
      !Number.isFinite(context.createdAt) ||
      context.createdAt > Date.now() ||
      Date.now() - context.createdAt > IDENTITY_LINK_MAX_AGE * 1000
    ) return null;
    return context;
  } catch {
    return null;
  }
}

export function getIdentityLinkErrorCode(code: string | undefined | null) {
  switch (code) {
    case "identity_already_exists":
    case "manual_linking_disabled":
    case "provider_disabled":
    case "session_changed":
      return code;
    case "access_denied":
    case "cancelled":
      return "cancelled";
    default:
      return "failed";
  }
}

export function getIdentityLinkErrorMessage(code?: string): string {
  switch (getIdentityLinkErrorCode(code)) {
    case "identity_already_exists":
      return "이미 이 계정 또는 다른 소크나 계정에 연결된 계정입니다. 다른 계정을 선택해 주세요.";
    case "manual_linking_disabled":
      return "현재 로그인 수단 추가를 사용할 수 없습니다. 운영진에게 문의해 주세요.";
    case "provider_disabled":
      return "아직 사용할 수 없는 로그인 방식입니다. 운영진에게 문의해 주세요.";
    case "session_changed":
      return "로그인 상태가 바뀌었거나 연결 요청이 만료되었습니다. 현재 계정을 확인한 뒤 다시 시도해 주세요.";
    case "cancelled":
      return "계정 연결을 취소했습니다.";
    default:
      return "로그인 수단을 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
}

export function getSafeAuthNext(next: string | null, origin: string): string {
  if (!next?.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  try {
    const url = new URL(next, origin);
    if (url.origin !== origin || url.pathname.startsWith("/auth/")) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}