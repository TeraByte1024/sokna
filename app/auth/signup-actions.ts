"use server";

import { cookies, headers } from "next/headers";
import { currentLegalDocuments } from "@/lib/legal-consent";
import { createClient } from "@/lib/supabase/server";
import { getLoginDestination } from "@/lib/auth/login-flow";
import {
  readSignupConsent, signSignupConsent, SIGNUP_CONSENT_COOKIE, SIGNUP_CONSENT_METADATA,
  type SignupConsentMethod,
} from "@/lib/signup-consent";

export async function getSignupLegalDocumentsAction() {
  try {
    const current = currentLegalDocuments();
    if (current.documents.length !== 2) throw new Error("Missing terms");
    return { ok: true as const, ...current };
  } catch {
    return { ok: false as const, error: "가입 약관을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
}

export async function prepareSignupConsentAction(input: {
  method: SignupConsentMethod; email?: string; revision: string;
  termsAgreed: boolean; privacyAgreed: boolean; marketingAgreed: boolean;
}) {
  try {
    const current = currentLegalDocuments();
    if (current.documents.length !== 2 || input.revision !== current.revision ||
      (!current.published && process.env.NODE_ENV !== "development")) {
      return { ok: false as const, error: "약관이 변경되었습니다. 창을 닫고 최신 약관을 다시 확인해 주세요." };
    }
    if (input.termsAgreed !== true || input.privacyAgreed !== true || typeof input.marketingAgreed !== "boolean" ||
      !["signup", "email", "google", "kakao"].includes(input.method)) {
      return { ok: false as const, error: "필수 약관 동의 여부를 확인해 주세요." };
    }
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : undefined;
    if (input.method === "email" && (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      return { ok: false as const, error: "이메일 주소를 확인해 주세요." };
    }
    const token = signSignupConsent({ method: input.method, email: input.method === "email" ? email : undefined,
      revision: current.revision, acceptedAt: Date.now(), marketingAgreed: input.marketingAgreed, preview: !current.published });
    if (input.method === "google" || input.method === "kakao") {
      (await cookies()).set(SIGNUP_CONSENT_COOKIE, token, {
        httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 3600,
      });
    }
    return { ok: true as const, token, consentState: token.split(".")[1] };
  } catch {
    return { ok: false as const, error: "동의 내역을 준비하지 못했습니다. 다시 시도해 주세요." };
  }
}

export async function bindSocialSignupConsentAction(input: { token: string; method: "google" | "kakao" }) {
  try {
    const ticket = readSignupConsent(input?.token);
    const current = currentLegalDocuments();
    if (!ticket || ticket.method !== "signup" || !["google", "kakao"].includes(input.method) ||
      Date.now() - ticket.acceptedAt > 3600_000 || ticket.revision !== current.revision || ticket.preview !== !current.published) {
      return { ok: false as const, error: "가입 약관을 다시 확인해 주세요. 회원가입 화면을 새로 열어 주세요." };
    }
    const token = signSignupConsent({ ...ticket, method: input.method });
    (await cookies()).set(SIGNUP_CONSENT_COOKIE, token, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 3600,
    });
    return { ok: true as const, token, consentState: token.split(".")[1] };
  } catch {
    return { ok: false as const, error: "가입을 준비하지 못했습니다. 다시 시도해 주세요." };
  }
}

export async function signUpWithConsentAction(input: { email: string; password: string; token: string; next?: string }) {
  try {
    const ticket = readSignupConsent(input?.token);
    const email = typeof input?.email === "string" ? input.email.trim().toLowerCase() : "";
    const current = currentLegalDocuments();
    if (!ticket || !["email", "signup"].includes(ticket.method) || (ticket.method === "email" && ticket.email !== email) ||
      Date.now() - ticket.acceptedAt > 3600_000 || ticket.revision !== current.revision || ticket.preview !== !current.published) {
      return { ok: false as const, error: "가입 전에 최신 약관에 동의해 주세요." };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false as const, error: "이메일 주소를 확인해 주세요." };
    if (typeof input.password !== "string" || input.password.length < 6 || input.password.length > 1024) {
      return { ok: false as const, error: "비밀번호는 6자 이상이어야 합니다." };
    }
    // Next validates the request origin before invoking a server action. Do not trust a client-supplied redirect origin.
    const origin = (await headers()).get("origin");
    if (!origin || !/^https?:\/\//.test(origin)) throw new Error("Missing request origin");
    const next = getLoginDestination(input.next ?? null, origin);
    const boundToken = ticket.method === "signup" ? signSignupConsent({ ...ticket, method: "email", email }) : input.token;
    const { data, error } = await (await createClient()).auth.signUp({ email, password: input.password,
      options: { emailRedirectTo: `${origin}/auth/confirm?${new URLSearchParams({ onboarding: "membership", next })}`,
        data: { marketing_opt_in: ticket.preview ? false : ticket.marketingAgreed, [SIGNUP_CONSENT_METADATA]: boundToken } },
    });
    if (error) return { ok: false as const, error: "회원가입을 완료하지 못했습니다. 입력 정보와 기존 가입 여부를 확인해 주세요." };
    return { ok: true as const, hasSession: Boolean(data.session) };
  } catch {
    return { ok: false as const, error: "회원가입을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
}
