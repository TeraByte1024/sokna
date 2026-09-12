# 인증 및 권한 관리 명세 (Authentication & Authorization)

## 1. 기능 개요
SOKNA 애플리케이션은 **Supabase Auth**와 `@supabase/ssr`을 결합하여 쿠키 기반의 안전한 세션 관리 및 역할 기반 권한 제어(일반 회원 / 관리자)를 수행합니다.

---

## 2. 세부 명세

### 2.1 인증 플로우 (Authentication Flow)
1. **회원가입 (`/auth/sign-up`)**:
   - 이메일, 비밀번호, 이름, 기수, 파트 정보를 입력받아 계정을 생성합니다.
   - 가입 성공 시 Supabase `auth.users`와 연계하여 `public.users` 레코드를 생성/매핑합니다.
2. **로그인 (`/auth/login`)**:
   - 이메일 / 패스워드 인증을 수행합니다.
   - 브라우저 쿠키(HttpOnly)에 세션 토큰을 보관합니다.
3. **세션 유지 및 프록시 (`proxy.ts`)**:
   - Next.js 미들웨어 계층(`proxy.ts` -> `lib/supabase/proxy.ts`)에서 모든 요청에 대해 `updateSession`을 실행하여 만료 전 토큰을 갱신합니다.
   - 정적 리소스(`_next/static`, 이미지 파일, 파비콘 등)는 프록시 대상에서 제외됩니다.
4. **비밀번호 재설정 (`/auth/forgot-password`, `/auth/update-password`)**:
   - 이메일 재설정 링크 발송 및 토큰 검증 후 새로운 비밀번호로 변경합니다.

### 2.2 권한 제어 (Role-Based Authorization)
- **일반 회원 (User)**:
   - 로그인된 인증 사용자.
   - 공연 목록 및 상세 조회 가능.
   - 자신이 `performer`로 등록된 공연에 한해 곡(Setlist) 추가 및 본인 등록 곡 삭제/수정 가능.
- **관리자 (Admin)**:
   - `public.admins` 테이블에 등록된 이메일을 소유한 사용자.
   - 공연 등록 (`/gigs/new`) 권한 보유.
   - `lib/auth-admin.ts`의 `getIsAdmin()` 함수를 통해 서버 사이드에서 판별:
     ```ts
     const allowed = await getIsAdmin();
     if (!allowed) return { ok: false, error: "관리자만 접근 가능합니다." };
     ```
   - 단일 요청 내 중복 조회를 줄이기 위해 React `cache()`로 래핑되어 있습니다.

---

## 3. 관련 파일 링크
- 프록시 미들웨어: [proxy.ts](file:///c:/dev/sokna/proxy.ts)
- 서버 클라이언트: [lib/supabase/server.ts](file:///c:/dev/sokna/lib/supabase/server.ts)
- 관리자 권한 검증: [lib/auth-admin.ts](file:///c:/dev/sokna/lib/auth-admin.ts)
- 로그인 폼 컴포넌트: [components/login-form.tsx](file:///c:/dev/sokna/components/login-form.tsx)
- 회원가입 폼 컴포넌트: [components/sign-up-form.tsx](file:///c:/dev/sokna/components/sign-up-form.tsx)
