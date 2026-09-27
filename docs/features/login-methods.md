# 로그인 수단 추가 및 연결 해제 명세서

> **작성일자**: 2026-09-27
> **상태**: Google 연결·해제 구현 및 운영 DB 보호 규칙 적용 완료. 실제 Google 계정 E2E 및 운영 코드 배포 미확인.

## 1. 배경 및 목적 (Background & Objectives)

이메일 주소가 다른 Google 계정들을 하나의 소크나 계정에 연결하고, 필요 없는 Google 연결을 프로필에서 해제합니다. 회원 ID·가입 승인·관리자 권한·공연 기록은 로그인 수단과 분리하여 유지합니다.

## 2. 세부 요구사항 (Requirements)

### 2.1 사용자 시나리오

1. 유지할 계정으로 로그인하여 `/profile`의 로그인 수단 목록을 확인합니다.
2. Google 계정 추가 버튼에서 계정을 선택하고 인증합니다. 이메일이 달라도 연결할 수 있습니다.
3. 연결된 각 Google 항목의 연결 해제를 누르면 대상 이메일을 확인하는 대화상자가 나타납니다.
4. 확인 후 해당 Google 연결을 해제하고, 페이지를 떠나지 않고 목록을 갱신합니다. 미저장 프로필 입력은 유지합니다.
5. 연결된 어느 Google 계정으로 로그인해도 같은 소크나 회원 ID와 활동 기록을 사용합니다.

### 2.2 비즈니스 로직 및 제약사항

- Supabase Auth의 `linkIdentity`·`unlinkIdentity` API를 사용합니다. 이메일 입력만으로 로그인 수단을 만들거나 서로 다른 소크나 계정의 데이터를 병합하지 않습니다.
- 서버가 `auth.getUser()`로 검증한 사용자 ID와 화면의 예상 사용자 ID를 비교합니다. 다른 탭에서 로그인 계정이 바뀌면 이전 화면의 요청을 거절합니다.
- 연결 시작은 `prompt: "select_account"`로 Google 계정 선택을 요청합니다. 일반 로그인은 기존 `prompt: "select_account consent"`와 동의 절차를 유지합니다.
- 연결 컨텍스트는 HttpOnly 쿠키에 기록하며, 콜백에서 nonce·유효 시간·사용자 ID를 검증합니다. 고정된 `/profile`로 결과를 돌려보냅니다.
- 해제 대상은 현재 사용자 identities 안의 정확한 `identity_id`로 찾습니다. 클라이언트가 제출한 provider/이메일/identity 객체를 신뢰하지 않습니다.
- 해제는 Google 항목만 지원합니다. 기존 이메일 로그인은 표시·유지합니다. 이메일 identity 삭제만으로 비밀번호 인증이 비활성화되지는 않으므로 이메일 삭제 기능으로 제공하지 않습니다.
- 해제 후에도 로그인 가능한 대체 수단이 필요합니다. 다른 Google identity 또는 확인된 이메일 identity를 대체 수단으로 인정합니다. 미확인 이메일·지원하지 않는 provider만 남는 해제는 거절합니다. UI와 서버에서 모두 검사하고 Supabase도 마지막 identity 삭제를 거절합니다.
- 연결 추가 시 대표 이메일은 유지합니다. 대표 Google 연결 해제 시에는 Supabase가 남은 identity의 이메일을 대표 이메일로 선택할 수 있습니다. 회원 이메일·관리자 표시 이메일은 같은 DB 트랜잭션에서 동기화하며 권한은 변하지 않는 사용자 ID를 기준으로 판단합니다.
- 다른 Auth 계정과 이메일이 충돌하면 Supabase가 해제를 거절합니다. 성공 이전 오류와 성공 이후 세션/목록 갱신 오류를 구분하여 이미 완료된 해제를 재시도하도록 안내하지 않습니다.
- 같은 이메일의 다른 identity가 남아 있으면 이후 Google 로그인에서 Supabase의 자동 연결이 다시 일어날 수 있습니다. 연결 해제는 해당 Google 계정의 영구 차단이나 다른 기기의 세션 종료가 아닙니다.
- 이미 다른 소크나 계정에 연결된 Google 계정은 추가할 수 없습니다.

### 2.3 Supabase 지원 범위와 운영 조건

- [Identity Linking 공식 문서](https://supabase.com/docs/guides/auth/auth-identity-linking)는 다른 이메일의 OAuth identity 수동 연결 및 동일 이메일 자동 연결을 설명합니다.
- [unlinkIdentity API](https://supabase.com/docs/reference/javascript/auth-unlinkidentity)를 사용하며, 운영 Auth 버전 `v2.188.1`의 [연결·해제 구현](https://github.com/supabase/auth/blob/v2.188.1/internal/api/identity.go)과 [대표 이메일 선택](https://github.com/supabase/auth/blob/v2.188.1/internal/models/user.go)을 확인했습니다.
- 2026-09-27 사용자 승인 후 SOKNA의 `security_manual_linking_enabled`를 활성화했습니다. 기존 Redirect URLs를 보존하여 로컬·운영의 `/auth/callback?intent=link&link_state=…` 허용 패턴을 추가했고, 두 설정만 변경된 것을 재조회했습니다.
- 로컬·운영 각각의 OAuth 시작 요청을 즉시 취소하여 원래 콜백 경로와 nonce 보존을 확인했습니다. 이 검증은 실제 Google 로그인·연결·해제를 수행하지 않았습니다.
- 콜백 설정은 [환경 설정 가이드](../maintenance/environment-setup.md#26-google-계정-추가-로그인-설정)를 따릅니다.

## 3. 데이터 모델 변경 (Database Changes)

- 회원 테이블·로그인 수단 전용 테이블·컬럼은 추가하지 않습니다. 연결 정보는 Supabase가 관리하는 `auth.identities`를 인증 API로 조회·연결·해제합니다.
- `20260927030000_manage_login_identities.sql`은 Auth 대표 이메일 변경 시 `public.users.email`·동일 ID의 `public.admins.email`을 동기화하고, 관리자 권한을 `auth.uid() = admins.id`로 판단하도록 변경합니다.
- 마이그레이션은 기존 관리자 ID 정합성을 검사하여 레거시 이메일 기반 권한을 조용히 잃게 하지 않습니다. 운영 사전 조회에서 관리자 7명 모두 실제 Auth ID와 이메일이 일치하고, 레거시·충돌·고아 레코드가 없음을 확인했습니다.
- 이메일 동기화 함수는 빈 search_path의 SECURITY DEFINER로 실행하며 PUBLIC·anon·authenticated 직접 호출 권한을 허용하지 않습니다. 사용자 ID, 가입 상태, 승인 시각, 이름, 기수, 세션 및 활동 기록을 변경하지 않습니다.
- Google identity 삭제 트리거는 부모 Auth 사용자 행을 잠근 후 남은 사용 가능한 수단을 다시 검사하여 Google 해제 요청을 계정별로 직렬화합니다. 전체 계정 삭제 cascade·soft delete 및 새 Google identity 생성 후 미확인 identity 정리는 유지합니다. 다른 provider 직접 삭제는 보호 범위에 포함하지 않습니다.
- 2026-09-27 이 마이그레이션만 운영 DB에 적용하고 이력·활성화·권한·기존 관리자 7명 보존을 재확인했습니다. npm run types 실행 결과 공개 타입 내용은 동일합니다.
- 실제 적용 상태와 데이터 무결성 규칙은 [DB 스키마 명세](../architecture/database-schema.md)를 따릅니다.

## 4. API / Server Action 명세

### `startGoogleIdentityLinkAction(expectedUserId)`

- 위치: `app/profile/login-method-actions.ts`.
- 출력: `{ ok: true; url: string } | { ok: false; error: string }`.
- 검증된 현재 사용자와 화면 ID를 대조한 후 Google 인증 URL을 요청합니다.
- 현재 앱 origin의 `/auth/callback?intent=link&link_state=<nonce>`만 redirectTo로 사용합니다.
- 컨텍스트 쿠키 `sokna-identity-link`: userId·nonce·createdAt, HttpOnly, SameSite=Lax, 경로 /auth/callback, 600초, HTTPS에서 Secure.
- 시작 실패 시 오류를 안내하고 미저장 변경 보호를 유지합니다.

### `unlinkGoogleIdentityAction(expectedUserId, identityId)`

- 위치: `app/profile/login-method-actions.ts`.
- 출력: `{ ok: true; message: string } | { ok: false; error: string }`.
- 현재 사용자, 대상 소유권, Google provider, 대체 로그인 수단을 다시 검증한 후 `auth.unlinkIdentity`를 호출합니다. 서비스 역할 키를 사용하지 않습니다.
- 해제 성공 후 `refreshSession()`으로 변경된 대표 이메일을 세션에 반영하고 프로필·관리자 화면의 캐시를 갱신합니다.
- 해제 자체가 성공한 뒤 세션/캐시 갱신만 실패하면 성공 응답에 새로고침 안내를 포함합니다.
- 공통 표시·해제 가능 여부와 오류 안내는 `lib/auth/login-methods.ts`에서 관리합니다. 제공자 오류 원문이나 인증 메타데이터를 클라이언트에 노출하지 않습니다.

### `GET /auth/callback?intent=link&link_state=<nonce>`

- 기존 일반 로그인 콜백과 연결 흐름을 구분합니다. 일회성 컨텍스트와 교환된 세션의 사용자 ID를 검증하고 쿠키를 정리합니다.
- 오류는 허용된 코드의 한국어 안내로 변환하며 고정된 프로필 경로로 돌아갑니다.
- OAuth 오류가 fragment로 전달되는 경우에도 허용된 error_code만 해석하고 fragment를 제거합니다. 오류 설명 원문을 출력하지 않습니다.

## 5. UI / UX 설계 (Component Architecture)

- `app/profile/login-methods-section.tsx`는 방식·이메일·해제 버튼과 확인 대화상자를 렌더링합니다.
- `components/google-logo.tsx`의 공통 4색 Google G를 기존 로그인 버튼, 연결 목록, 추가 버튼 및 해제 확인에 사용합니다. 장식 SVG는 aria-hidden이며 인접 텍스트로 의미를 전달합니다.
- Google 항목에는 연결 해제 버튼을 제공합니다. 대체 수단이 없으면 버튼을 비활성화하고 다른 Google 계정을 먼저 추가하도록 안내합니다.
- 확인 대화상자에는 대상 이메일, 회원 정보 유지 안내, 취소·해제 버튼을 표시합니다. 요청 중 중복 실행과 대화상자 닫기를 막고 오류는 대화상자에 유지합니다. 동일 이메일(대소문자 무시)의 다른 수단이 남아 있으면 향후 Google 로그인에서 자동 재연결될 수 있다는 안내를 확인창에 표시합니다.
- Google 추가로 페이지를 떠날 때 미저장 변경 확인을 거칩니다. 해제는 현재 페이지에서 처리하고 router.refresh로 최신 목록을 읽으면서 입력 초안을 유지합니다.
- 저장·로그아웃·회원 탈퇴·푸시 설정·로그인 수단 변경이 동시에 실행되지 않도록 작업 중 상태를 공유합니다.

## 6. 테스트 및 검증 계획 (Verification Plan)

- 연결: 미인증·계정 전환·제공자 실패, 콜백 누락·만료·nonce 불일치·사용자 불일치·정상 결과.
- 해제: 미인증·계정 전환·다른 사용자 identity·이메일 identity·마지막 수단·미확인 대체 수단 차단, 소유한 Google 해제, 제공자 실패, 완료 후 세션/캐시 갱신 실패.
- UI: 여러 Google 이메일과 로고, 마지막 수단 비활성화, 확인/취소, 중복 해제 방지, 오류 유지, 성공 후 목록 갱신과 미저장 입력 보존.
- DB: 대표 이메일 동기화와 충돌 롤백, ID 기반 관리자 권한 보존과 옛 이메일에 권한 미부여, 탈퇴 회귀.
- TypeScript, 변경 코드 ESLint, 전체 테스트, 프로덕션 빌드 및 diff 공백 검증.
- 실제 Google 계정 2개로 연결·해제·각각 재로그인하여 같은 회원 ID와 기록을 사용하는 E2E는 별도 확인이 필요합니다.

### 2026-09-27 검증 결과

- 전체 자동 테스트 410개, 프로덕션 빌드(TypeScript 포함), 변경 코드 ESLint 통과.
- 격리 SQL 9개 검증: 이메일 승격·관리자 보존·옛 이메일 권한 차단·마지막 수단·충돌 롤백·자동 교체·soft delete·탈퇴 cascade·레거시 정합성 검사. 실행: PGLITE_MODULE_PATH를 설치된 @electric-sql/pglite 모듈 경로로 지정한 뒤 node tests/run-login-identities-sql.mjs. 단일 연결 PGlite에서 독립 세션의 실제 경합은 재현하지 않았습니다.
- 실제 React 컴포넌트와 생성한 Tailwind CSS로 320px·390px 모바일, 데스크톱, 확인 대화상자를 시각 검증했습니다. 긴 이메일과 해제 버튼의 겹침 및 가로 넘침이 없고 4색 Google 로고를 확인했습니다.