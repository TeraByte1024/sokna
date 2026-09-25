# 인증 및 권한 관리 명세 (Authentication & Authorization)

## 1. 기능 개요
SOKNA 애플리케이션은 **Supabase Auth**와 `@supabase/ssr`을 결합하여 쿠키 기반의 안전한 세션 관리 및 역할 기반 권한 제어(일반 회원 / 관리자)를 수행합니다.

---

## 2. 세부 명세

### 2.1 인증 플로우 (Authentication Flow)
1. **회원가입 신청 (`/auth/sign-up`)**:
   - 이메일, 비밀번호, 실명, 기수, 세션(보컬(남), 보컬(여), 기타, 베이스, 드럼, 건반, 창작, 직접 입력)을 입력받습니다.
   - 개인정보 수집·이용 및 부원 명부 내 열람 동의(필수)와 공연/행사 소식 푸시 알림 수신 동의(선택)를 체크합니다.
   - 신청 완료 시 `public.users`에 `status = 'pending'` 상태로 저장되며, 관리자(`admins`)에게 `notifications` 알림이 자동 생성됩니다. 관리자 계정이 마케팅 알림에 동의하고 기기 토큰을 등록한 경우 cron 주기와 무관하게 웹 푸시를 즉시 발송합니다.
2. **구글 소셜 로그인 (`Google OAuth`)**:
   - 로그인/가입 화면에서 Google 계정으로 1초 만에 간편 로그인할 수 있습니다.
   - OAuth 콜백(`app/auth/callback/route.ts`)에서 세션을 교환하며, 기수/세션 정보가 없는 신규 소셜 가입자는 프로필 등록 화면(`/auth/complete-profile`)으로 자동 안내됩니다.
   - 클라이언트는 현재 origin의 `/auth/callback`을 `redirectTo`로 전달합니다. 따라서 로컬 테스트 시 Supabase Auth Redirect URLs에 `http://localhost:3000/auth/callback`이 반드시 허용되어야 하며, 누락 시 운영 Site URL로 fallback될 수 있습니다.
   - 프로필 입력 화면에서도 세션 프리셋의 보컬을 `보컬(남)`과 `보컬(여)`로 구분하여 입력받습니다.
   - 프로필 입력 완료 시 관리자 승인 대기(`pending`) 상태로 전환되며, 관리자에게 알림이 발송됩니다.
3. **관리자 승인 (`/admin/members`)**:
   - 관리자가 독립된 관리자 전용 페이지에서 신청 내역을 검토한 후 승인(`status = 'approved'`) 또는 거절(`status = 'rejected'`)합니다.
   - 승인 시 해당 회원에게 "가입 승인 완료" 인앱 알림이 등록됩니다. 회원이 마케팅 알림에 동의하고 기기 토큰을 등록한 경우 동일 outbox 레코드를 cron 주기와 무관하게 웹 푸시로 즉시 발송하며, 클릭 시 `/members`로 이동합니다.
   - 승인 상태 전이는 `pending` 상태에서만 허용하여 중복 승인에 따른 알림 중복 생성을 방지합니다.
4. **로그인 (`/auth/login`)**:
   - 이메일 / 패스워드 인증 및 구글 소셜 로그인을 지원합니다.
   - 브라우저 쿠키(HttpOnly)에 세션 토큰을 보관합니다.
   - 미승인(`pending`) 상태인 경우 승인 대기 안내 배지가 표시되며, 거절(`rejected`)된 계정은 로그인이 차단됩니다.
   - 이미 로그인한 사용자가 `/auth/login`에 접근하면 프록시에서 안전한 내부 `redirect` 경로로 이동시키고, 유효하지 않거나 지정되지 않은 경우 `/`로 이동시킵니다. 리다이렉트 응답에도 갱신된 세션 쿠키를 유지합니다.
5. **세션 유지 및 프록시 (`proxy.ts`)**:
   - Next.js 미들웨어 계층(`proxy.ts` -> `lib/supabase/proxy.ts`)에서 모든 요청에 대해 `updateSession`을 실행하여 만료 전 토큰을 갱신합니다.
   - 정적 리소스(`_next/static`, 이미지 파일, 파비콘 등)는 프록시 대상에서 제외됩니다.
6. **비밀번호 재설정 (`/auth/forgot-password`, `/auth/update-password`)**:
   - 이메일 재설정 링크 발송 및 토큰 검증 후 새로운 비밀번호로 변경합니다.

### 2.2 프로필 및 회원 정보 관리 (Profile & Member Information Management)
1. **회원 본인의 정보 수정 (`/profile`)**:
   - 로그인한 모든 회원(일반 회원 및 관리자)은 상단 헤더의 `[내 정보]` 버튼을 통해 자신의 프로필 관리 화면에 접근할 수 있습니다.
   - 헤더 프로필 팝업과 `/profile`의 수신 동의 체크박스 아래에서 현재 브라우저의 `이 기기에서 알림 받기` 토글을 켜거나 끌 수 있습니다. 팝업은 해당 항목이 한 줄로 표시되는 너비를 유지하며, 미동의 상태에서 켜면 수신 동의 다이얼로그를 먼저 표시합니다.
   - 수신 동의 여부는 `/profile`의 기존 정보 수정 폼 안에서 확인·변경하며, 동의 시각은 `users.marketing_opted_in_at`에 기록합니다. 기존 동의자의 null 시각은 소급하지 않습니다. 별도의 앱 푸시 설정 카드는 표시하지 않습니다.
   - 수정 가능한 정보: 실명(이름), 입부 기수(1 이상 숫자), 세션/파트(선택 사항), 마케팅/행사 소식 수신 동의.
   - 로그인 계정 이메일 및 승인 상태(`status`), 관리자 권한(`admins`)은 일반 회원이 임의로 변조할 수 없도록 서버 액션(`app/profile/actions.ts`)에서 격리 보호됩니다.
   - 관리자가 본인의 이름을 변경할 경우 `admins` 테이블의 이름도 자동으로 동기화됩니다.
   - 마케팅 알림 수신 동의를 철회하면 등록된 모든 FCM 기기 토큰이 즉시 삭제되어 이후 푸시 대상에서 제외됩니다.
2. **관리자의 회원 정보 수정 (`/admin/members`)**:
   - 관리자는 회원 관리 페이지의 전체 회원 명부(또는 가입 승인 대기 목록)에서 각 회원의 `[수정]` 버튼을 클릭하여 이름, 기수, 세션 정보를 직접 교정할 수 있습니다.
   - 세션은 필수 입력 항목이 아니며, 프리셋 칩(`보컬`, `기타`, `베이스`, `드럼`, `건반`, `창작`, `직접 입력`) 및 "선택 해제"를 지원합니다.

### 2.3 권한 제어 (Role-Based Authorization)
- **일반 회원 (User)**:
   - 로그인된 인증 사용자.
   - 공연 목록 및 상세 조회 가능.
   - 본인의 프로필(`name`, `generation`, `part`, `marketing_opt_in`) 조회 및 수정 가능 (`/profile`).
   - 자신이 `performer`로 등록된 공연에 한해 곡(Setlist) 추가 및 본인 등록 곡 삭제/수정 가능.
- **관리자 (Admin)**:
   - `public.admins` 테이블에 등록된 이메일을 소유한 사용자.
   - 공연 등록 (`/gigs/new`) 권한 보유.
   - 회원 가입 승인/거절, 관리자 권한 부여/해제 및 회원 정보 수정 권한 보유 (`/admin/members`).
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
- 내 정보 페이지: [app/profile/page.tsx](file:///c:/dev/sokna/app/profile/page.tsx)
- 회원 관리(관리자): [app/admin/members/page.tsx](file:///c:/dev/sokna/app/admin/members/page.tsx)
