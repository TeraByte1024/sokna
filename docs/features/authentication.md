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
2. **Google·카카오 소셜 로그인 (`OAuth`)**:
   - 로그인/가입 화면에서 Google 또는 카카오계정으로 로그인할 수 있습니다. 카카오는 공식 노란색 버튼과 말풍선 로고를 사용하며 앱·제공자 설정 완료 후 이용할 수 있습니다.
   - 일반 Google 로그인은 `prompt: "select_account consent"`로 계정 선택을 명시적으로 요청합니다. 여러 Google 계정을 연결한 회원은 사용할 계정을 선택할 수 있으며 기존 OAuth 동의 절차를 유지합니다.
   - OAuth 콜백(`app/auth/callback/route.ts`)에서 세션을 교환하며, 기수/세션 정보가 없는 신규 소셜 가입자는 프로필 등록 화면(`/auth/complete-profile`)으로 자동 안내됩니다.
   - 클라이언트는 현재 origin의 `/auth/callback`을 `redirectTo`로 전달합니다. 따라서 로컬 테스트 시 Supabase Auth Redirect URLs에 `http://localhost:3000/auth/callback`이 반드시 허용되어야 하며, 누락 시 운영 Site URL로 fallback될 수 있습니다.
   - 프로필 입력 화면에서도 세션 프리셋의 보컬을 `보컬(남)`과 `보컬(여)`로 구분하여 입력받습니다.
   - 프로필 입력 완료 시 관리자 승인 대기(`pending`) 상태로 전환되며, users 트리거가 같은 트랜잭션으로 관리자 알림을 만들고 해당 이벤트를 즉시 발송합니다. 이미 완성된 pending 신청의 프로필 재저장에는 알림을 중복 생성하지 않습니다.
   - OAuth 최초 로그인으로 생성된 `public.users` 레코드도 DB 기본값은 `pending`이지만, **가입 신청 전 계정**으로 취급합니다. 기수(1 이상의 정수)와 공백이 아닌 세션이 저장되기 전에는 관리자 승인 대기 명단·헤더 알림 건수·본인의 승인 대기 배지에서 제외합니다.
   - `hasCompletedMemberProfile()`로 프로필 등록 화면 진입과 신청 완료 여부를 공통 판별합니다. 미작성 계정의 `/profile` 접근은 `/auth/complete-profile`로 안내하며, 등록 완료 후 관리자 페이지와 공통 레이아웃을 갱신합니다.
3. **관리자 승인 (`/admin/members`)**:
   - 관리자가 독립된 관리자 전용 페이지에서 신청 내역을 검토한 후 승인(`status = 'approved'`) 또는 거절(`status = 'rejected'`)합니다.
   - 승인 시 해당 회원에게 "가입 승인 완료" 인앱 알림이 등록됩니다. 회원이 마케팅 알림에 동의하고 기기 토큰을 등록한 경우 동일 outbox 레코드를 cron 주기와 무관하게 웹 푸시로 즉시 발송하며, 클릭 시 `/members`로 이동합니다.
   - 승인 상태 전이는 `pending` 상태에서만 허용하여 중복 승인에 따른 알림 중복 생성을 방지합니다.
4. **로그인 (`/auth/login`)**:
   - 이메일 / 패스워드 인증 및 Google·카카오 소셜 로그인을 지원합니다.
   - 브라우저 쿠키(HttpOnly)에 세션 토큰을 보관합니다.
   - 필수 부원 정보를 등록한 미승인(`pending`) 상태인 경우에만 승인 대기 안내 배지가 표시되며, 거절(`rejected`)된 계정은 로그인이 차단됩니다.
   - 이미 로그인한 사용자가 `/auth/login`에 접근하면 프록시에서 안전한 내부 `redirect` 경로로 이동시키고, 유효하지 않거나 지정되지 않은 경우 `/`로 이동시킵니다. 리다이렉트 응답에도 갱신된 세션 쿠키를 유지합니다.
5. **세션 유지 및 프록시 (`proxy.ts`)**:
   - Next.js 미들웨어 계층(`proxy.ts` -> `lib/supabase/proxy.ts`)에서 모든 요청에 대해 `updateSession`을 실행하여 만료 전 토큰을 갱신합니다.
   - 정적 리소스(`_next/static`, 이미지 파일, 파비콘 등)는 프록시 대상에서 제외됩니다.
6. **비밀번호 재설정 (`/auth/forgot-password`, `/auth/update-password`)**:
   - 이메일 재설정 링크 발송 및 토큰 검증 후 새로운 비밀번호로 변경합니다.
7. **로그아웃과 기기 알림 수신 계정**:
   - 프로필 상단 요약 카드에서 로그아웃할 수 있습니다. 미저장 수정이 있으면 확인을 거치며, 실패 시 편집 내용과 이탈 경고를 유지합니다. 데스크톱에서는 기존 헤더 프로필 메뉴도 제공합니다.
   - `signOutWithPushSession()`으로 현재 기기의 수신 계정 연결만 정지한 뒤 `signOut({ scope: "local" })`을 실행합니다. 기기 토큰과 푸시 구독은 보존하고 다른 기기의 로그인은 유지합니다.
   - 다음 사용자가 로그인하면 서버가 기기 증명 쿠키를 검증하여 동일 기기를 새 계정에 연결합니다. 로그인 계정의 수신 동의를 적용하며, 알림 표시와 클릭 직전에 세션을 다시 검사하므로 이전 계정의 지연 알림은 차단합니다.
   - 연결 정지 오류가 로그아웃을 막지는 않습니다. 세션 종료 자체가 실패하면 기기 연결 확인을 재개하고 사용자에게 오류를 알립니다.

8. **Google·카카오 로그인 수단 추가 및 연결 해제**:
   - `/profile`에서 기존 이메일 로그인과 Google·카카오계정을 확인하고 다른 이메일의 계정도 추가·해제합니다. 각 제공자의 로고를 로그인 버튼·목록·추가 버튼에 사용합니다.
   - 화면 사용자 ID와 서버의 검증된 사용자를 대조한 뒤 Google 계정 선택창을 엽니다. HttpOnly 일회성 연결 컨텍스트와 콜백 세션의 사용자 ID를 확인하고 결과는 프로필에서 안내합니다.
   - 해제 시 대상 이메일을 확인하고 서버에서 본인 소유 Google·카카오 identity와 대체 로그인 수단을 다시 검사합니다. 마지막 로그인 수단은 해제할 수 없으며, 기존 이메일 로그인은 유지합니다.
   - 기존 사용자 ID·회원 승인·관리자 권한·공연 기록을 유지합니다. 대표 소셜 계정 해제 시 Supabase가 대표 이메일을 바꿀 수 있으며 회원·관리자 이메일은 DB 트리거에서 동기화합니다. 관리자 권한은 이메일이 아닌 변하지 않는 사용자 ID에 연결합니다.
   - 다른 회원 계정에 연결된 Google identity의 연결과 기존 계정 데이터 병합은 지원하지 않습니다. 같은 이메일의 다른 수단이 남으면 향후 Google 로그인에서 자동 연결될 수 있으며 연결 해제는 다른 기기의 세션을 종료하지 않습니다.
   - 2026-09-27 사용자 승인으로 Manual Linking과 연결 콜백 Redirect URLs를 적용·재확인했습니다. 실제 Google 계정 연결·해제 E2E는 미확인입니다. 상세 규칙은 [로그인 수단 관리 명세](./login-methods.md)를 따릅니다.

카카오는 `prompt: "select_account"`로 계정 선택을 요청하며 기존 PKCE 콜백·부원 정보 작성 흐름을 공유합니다. 일반 로그인과 계정 연결 모두 `queryParams.scope: "account_email"`로 이메일만 요청하며 닉네임·프로필 사진은 요청하지 않습니다. 이름은 부원 정보 작성 화면에서 직접 입력합니다. 설정 전에는 버튼에서 사용 불가를 안내합니다. 앱 등록·이메일 동의항목·이메일 확인 조건은 [카카오 로그인 명세](./kakao-login.md)를 따릅니다.

#### 가입 부원 정보 입력 UI

- 이메일 회원가입과 소셜 로그인 후 부원 정보 등록은 `components/member-profile-fields.tsx`를 공유하여 이름, 기수, 담당 세션의 디자인과 입력 동작을 통일합니다.
- 프로필 수정 폼과 동일하게 작은 라벨(`text-xs font-semibold`)과 `h-10` 입력 필드를 사용하며, 이름·기수는 모바일에서 세로로, `sm` 이상에서는 두 열로 배치합니다. 폼 카드는 `border-border/60 shadow-sm`, 제목은 `text-lg`, 설명은 `text-xs`를 사용합니다.
- 세션 선택 UI와 프리셋 목록은 `components/member-session-field.tsx`에서 관리하고, 가입 부원 정보 입력과 프로필 수정 폼이 함께 사용합니다.
- 세션은 `라벨 → 설명 → 선택 버튼` 순서로 배치하며, 라벨과 설명 사이 4px, 설명과 선택 버튼 사이 8px 간격을 유지합니다. 설명은 `components/ui/field-description.tsx`의 `FieldDescription`으로 11px·`leading-relaxed`·`text-muted-foreground` 스타일을 통일하고 `aria-describedby`로 필드와 연결합니다. 프로필의 이메일·기수 설명도 같은 배치 규칙을 사용합니다.
- 세션 선택은 `rounded-lg text-xs` 버튼을 사용하며 선택 상태는 `primary`, 기본 상태는 `muted` 색상으로 표시합니다. 키보드 포커스를 표시하고 `aria-pressed`로 각 버튼의 선택 여부를 제공합니다.
- 가입 세션은 필수 단일 선택이며 `보컬(남)`·`보컬(여)` 프리셋을 유지합니다. `직접 입력` 선택 시 아래의 `h-10` 필드에 세션명을 입력하며, 기존 선택 전환과 입력값 처리 규칙은 유지합니다.

### 2.2 프로필 및 회원 정보 관리 (Profile & Member Information Management)
1. **회원 본인의 정보 수정 (`/profile`)**:
   - 로그인한 모든 회원(일반 회원 및 관리자)은 데스크톱 헤더 프로필 메뉴의 `[내 정보]` 또는 모바일 하단 내비게이션의 `[프로필]`로 자신의 프로필 관리 화면에 접근할 수 있습니다. `md` 미만에서는 중복된 헤더 프로필 버튼을 숨기고 알림 버튼은 우측 상단에 유지합니다.
   - 가입 정보 미완성 계정은 `/profile`에서 가입 폼으로 이동하므로, 모바일 헤더에 프로필 버튼 대신 로그아웃 버튼을 제공합니다.
   - 데스크톱 헤더 프로필 팝업과 `/profile`의 수신 동의 체크박스 아래에서 현재 브라우저의 `이 기기에서 알림 받기` 토글을 켜거나 끌 수 있습니다. 팝업은 해당 항목이 한 줄로 표시되는 너비를 유지하며, 미동의 상태에서 켜면 수신 동의 다이얼로그를 먼저 표시합니다.
   - 기기 토글은 현재 계정의 서버 연결·수신 동의와 브라우저 토큰을 검증한 뒤 ON으로 표시합니다. 계정 변경 시 동일 기기의 연결을 새 계정으로 바꾸고 새 계정의 수신 동의를 확인합니다. 자동 갱신은 기존 등록만 수정하며, 동의 철회로 삭제된 등록은 사용자가 직접 켜야 복구됩니다. 상세 규칙은 [웹 푸시 알림 명세](./push-notifications.md)를 따릅니다.
   - 수신 동의 여부는 `/profile`의 기존 정보 수정 폼 안에서 확인·변경하며, 동의 시각은 `users.marketing_opted_in_at`에 기록합니다. 기존 동의자의 null 시각은 소급하지 않습니다. 별도의 앱 푸시 설정 카드는 표시하지 않습니다.
   - 수정 가능한 정보: 실명(이름), 입부 기수(1 이상 숫자), 세션/파트(선택 사항), 마케팅/행사 소식 수신 동의.
   - 세션은 가입과 같은 `MemberSessionField`로 `보컬(남)`·`보컬(여)` 등의 프리셋과 직접 입력을 지원합니다. 프로필에서는 선택된 항목을 다시 눌러 해제한 뒤 미지정(`null`) 저장이 가능합니다. 기존 `보컬` 및 프리셋에 없는 값은 직접 입력란에 그대로 표시합니다.
   - 로그인 계정 이메일 및 승인 상태(`status`), 관리자 권한(`admins`)은 일반 회원이 임의로 변조할 수 없도록 서버 액션(`app/profile/actions.ts`)에서 격리 보호됩니다.
   - 관리자가 본인의 이름을 변경할 경우 `admins` 테이블의 이름도 자동으로 동기화됩니다.
   - 마케팅 알림 수신 동의를 철회하면 등록된 모든 FCM 기기 토큰이 즉시 삭제되어 이후 푸시 대상에서 제외됩니다.
2. **관리자의 회원 정보 수정 (`/admin/members`)**:
   - 관리자는 회원 관리 페이지의 전체 회원 명부(또는 가입 승인 대기 목록)에서 각 회원의 `[수정]` 버튼을 클릭하여 이름, 기수, 세션 정보를 직접 교정할 수 있습니다.
   - 세션은 필수 입력 항목이 아니며, 프리셋 칩(`보컬`, `기타`, `베이스`, `드럼`, `건반`, `창작`, `직접 입력`) 및 "선택 해제"를 지원합니다.

### 2.3 권한 제어 (Role-Based Authorization)

회원은 `/profile`에서 확인 문구를 입력하여 본인 계정을 탈퇴할 수 있습니다. `deleteMyAccountAction`은 `auth.getUser()`로 확인한 세션으로 `delete_my_account` RPC를 호출합니다. 계정·개인 데이터는 단일 트랜잭션으로 삭제하며, 마지막 관리자 탈퇴는 차단합니다. 성공 후 세션을 정리하고 홈으로 이동합니다. 상세 정책은 [회원 탈퇴 명세](./account-withdrawal.md)를 따릅니다.

- **일반 회원 (User)**:
   - 관리자 승인이 완료된 인증 사용자(`public.users.status = 'approved'`). 로그인·가입 신청 완료 여부와 회원 승인은 별개입니다.
   - 회원 공개·전체 공개 공연의 목록과 상세 조회 가능. 미신청·승인 대기·반려·프로필 누락 계정은 전체 공개 공연만 조회하며 참가 신청을 할 수 없습니다.
   - 공연 접근은 `getGigViewer()`와 DB RLS에서 승인 상태를 검사합니다. 승인 후 선택 항목인 세션을 비워도 회원 권한은 유지됩니다.
   - 본인의 프로필(`name`, `generation`, `part`, `marketing_opt_in`) 조회 및 수정 가능 (`/profile`).
   - 자신이 `performer`로 등록된 공연에 한해 곡(Setlist) 추가 및 본인 등록 곡 삭제/수정 가능.
- **승인 상태 보호**: `users_protect_member_approval` DB 트리거가 일반 사용자의 `status`·`approved_at` 임의 변경을 차단합니다. 신규 본인 프로필은 `pending`으로만 등록할 수 있으며, 기존 반려 계정의 `rejected → pending` 재신청과 일반 프로필 수정은 허용합니다. 관리자 승인·반려 및 검증된 관리자 전용 RPC는 기존대로 동작합니다.
- **관리자 (Admin)**:
   - `public.admins` 테이블의 ID가 검증된 Auth 사용자 ID와 일치하는 사용자.
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
- 공통 부원 정보 입력 필드: [components/member-profile-fields.tsx](../../components/member-profile-fields.tsx)
- 공통 세션 선택 필드: [components/member-session-field.tsx](../../components/member-session-field.tsx)
- 공통 필드 설명: [components/ui/field-description.tsx](../../components/ui/field-description.tsx)
- 소셜 로그인 부원 정보 등록 폼: [app/auth/complete-profile/complete-profile-form.tsx](../../app/auth/complete-profile/complete-profile-form.tsx)
- 내 정보 페이지: [app/profile/page.tsx](file:///c:/dev/sokna/app/profile/page.tsx)
- 회원 관리(관리자): [app/admin/members/page.tsx](file:///c:/dev/sokna/app/admin/members/page.tsx)

### 알림 생성 구조 전환 (2026-09-27)
가입 신청의 users 트리거와 승인 RPC는 공통 내부 함수 `create_app_notification`으로 문구와 수신자별 `notifications`를 생성합니다. 이메일 가입의 auth 트리거는 users 생성만 담당하며 완성된 신청에만 관리자 알림이 생깁니다. 즉시 전송과 cron은 동일 outbox 처리 함수를 사용합니다. 공유 운영 DB에는 이 구조를 아직 적용하지 않았으며 [알림 outbox 전환 명세](./notification-outbox.md)에 따라 새 코드와 함께 적용해야 합니다.
