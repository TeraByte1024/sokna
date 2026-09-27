import type { User, UserIdentity } from "@supabase/supabase-js";
import { isSocialProvider } from "@/lib/auth/social-providers";

export type LoginIdentity = {
  id: string;
  provider: string;
  email: string | null;
  canUnlink: boolean;
  unlinkDisabledReason: string | null;
};

function identityEmail(identity: UserIdentity): string | null {
  return typeof identity.identity_data?.email === "string"
    ? identity.identity_data.email
    : null;
}

function isUsableIdentity(identity: UserIdentity, user: User): boolean {
  if (identity.provider === "google") {
    return identity.identity_data?.email_verified !== false;
  }
  if (identity.provider === "kakao") {
    return Boolean(identityEmail(identity)?.trim()) && identity.identity_data?.email_verified === true;
  }
  if (identity.provider === "email") {
    return identity.identity_data?.email_verified === true
      || Boolean(user.email_confirmed_at && identityEmail(identity) === user.email);
  }
  return false;
}

/** Only expose display fields and eligibility; never pass provider metadata to the client. */
export function getLoginIdentities(user: User): LoginIdentity[] {
  const identities = user.identities ?? [];
  return identities.map((identity) => {
    const hasAlternative = identities.some(
      (other) => other.identity_id !== identity.identity_id && isUsableIdentity(other, user),
    );
    const canUnlink = isSocialProvider(identity.provider) && hasAlternative;
    return {
      id: identity.identity_id,
      provider: identity.provider,
      email: identityEmail(identity),
      canUnlink,
      unlinkDisabledReason: !isSocialProvider(identity.provider)
        ? null
        : hasAlternative
          ? null
          : "로그인할 수단이 하나 이상 필요합니다. 다른 Google 또는 카카오 계정을 먼저 추가해 주세요.",
    };
  });
}

export function getIdentityUnlinkErrorMessage(code?: string): string {
  switch (code) {
    case "single_identity_not_deletable":
      return "마지막 로그인 수단은 해제할 수 없습니다. 다른 Google 또는 카카오 계정을 먼저 추가해 주세요.";
    case "identity_not_found":
      return "로그인 수단이 변경되었습니다. 새로고침 후 다시 시도해 주세요.";
    case "email_conflict_identity_not_deletable":
      return "다른 계정과 이메일이 중복되어 연결을 해제할 수 없습니다. 운영진에게 문의해 주세요.";
    case "manual_linking_disabled":
      return "현재 로그인 수단 관리를 사용할 수 없습니다. 운영진에게 문의해 주세요.";
    default:
      return "계정 연결을 해제하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
}
