# 05. 인증 및 계정 페이지 (`/auth/*`)

## 1. 개요 및 접근 권한
- **URL 경로**:
  - `/auth/login`: 로그인
  - `/auth/sign-up`: 회원가입
  - `/auth/forgot-password`: 비밀번호 찾기
  - `/auth/update-password`: 비밀번호 재설정
- **대상 사용자**: 비로그인 방문자 및 비밀번호 재설정이 필요한 회원
- **목적**: 동아리 회원의 계정 생성, 로그인 및 안전한 세션 쿠키 발급, 비밀번호 복구 흐름 제공.

---

## 2. 디자인 및 화면 레이아웃 (Layout & Visuals)

```
+-------------------------------------------------------------------+
|                                                                   |
|                   +-----------------------------+                 |
|                   | [SOKNA Logo]                |                 |
|                   | 로그인                      |                 |
|                   | 동아리 계정으로 접속하세요  |                 |
|                   |-----------------------------|                 |
|                   | 이메일                      |                 |
|                   | [ user@example.com        ] |                 |
|                   |                             |                 |
|                   | 비밀번호                    |                 |
|                   | [ ••••••••••              ] |                 |
|                   |                             |                 |
|                   | [      로그인하기         ] |                 |
|                   |                             |                 |
|                   | 비밀번호를 잊으셨나요?      |                 |
|                   | 계정이 없으신가요? 회원가입 |                 |
|                   +-----------------------------+                 |
|                                                                   |
+-------------------------------------------------------------------+
```

---

## 3. 화면별 UX 흐름 (User Interactions)

### 3.1 회원가입 (`/auth/sign-up`)
1. **입력 항목**:
   - 이메일 (계정 ID)
   - 비밀번호 (8자 이상)
   - 이름 (실명 입력)
   - 기수 (숫자, 예: 24)
   - 주 활동 파트 (보컬, 기타, 베이스, 드럼, 건반 등)
2. **제출 및 처리**:
   - Supabase Auth를 통해 계정을 생성하고, `public.users` 테이블에 이름, 기수, 파트 정보를 등록합니다.
   - 이메일 확인이 필요한 경우 `/auth/sign-up-success` 화면으로 안내합니다.
3. **작성 중 이탈 방지**:
   - 가입 정보를 입력 중인 상태(`isFormDirty`)에서 로그인 페이지 링크 클릭, 다른 페이지 이동, 새로고침 시 `LeaveConfirmDialog` 경고 팝업이 노출됩니다.

### 3.2 로그인 (`/auth/login`)
1. 이메일과 비밀번호를 입력하고 `[로그인]` 클릭.
2. 성공 시 서버 응답으로 HttpOnly 세션 쿠키가 브라우저에 저장되고 메인 또는 이전 페이지로 리다이렉트됩니다.
3. 실패 시 입력창 하단에 오류 문구(예: `"이메일 또는 비밀번호가 일치하지 않습니다."`)가 표시됩니다.

### 3.3 비밀번호 재설정 (`/auth/forgot-password` -> `/auth/update-password`)
1. `/auth/forgot-password`에서 가입한 이메일을 입력하면 비밀번호 변경 링크가 이메일로 발송됩니다.
2. 링크 클릭 시 `/auth/update-password`로 이동하여 새 비밀번호를 입력하고 즉시 갱신합니다.
3. 새 비밀번호 입력 중 페이지 이탈 시 `LeaveConfirmDialog`가 표시됩니다.

### 3.4 소셜 로그인 신규 부원 정보 등록 (`/auth/complete-profile`)
1. 구글 간편가입 후 필수 정보(기수, 세션 파트, 약관 동의)가 누락된 경우 자동 안내되는 폼입니다.
2. 부원 정보 입력 중 페이지를 벗어날 때 `LeaveConfirmDialog` 경고 팝업이 표시됩니다.

---

## 4. UI 상태 (States)

| 상태 | 화면 표시 및 처리 |
| :--- | :--- |
| **입력 중 (Idle)** | 입력 폼 활성화, 유효성 검사 대기 |
| **제출 중 (Submitting)** | 버튼 내 `Loader2` 스피너 표시 및 중복 클릭 방지 |
| **인증 오류 (Auth Error)** | 붉은색 에러 메시지 노출 (`text-destructive text-sm`) |
| **로그인 성공** | 쿠키 저장 후 목적지 페이지로 자동 이동 |

---

## 5. 관련 소스 코드 파일
- 로그인 페이지: [app/auth/login/page.tsx](file:///c:/dev/sokna/app/auth/login/page.tsx)
- 로그인 폼 컴포넌트: [components/login-form.tsx](file:///c:/dev/sokna/components/login-form.tsx)
- 회원가입 페이지: [app/auth/sign-up/page.tsx](file:///c:/dev/sokna/app/auth/sign-up/page.tsx)
- 회원가입 폼 컴포넌트: [components/sign-up-form.tsx](file:///c:/dev/sokna/components/sign-up-form.tsx)
- 비밀번호 찾기: [components/forgot-password-form.tsx](file:///c:/dev/sokna/components/forgot-password-form.tsx)
- 비밀번호 변경: [components/update-password-form.tsx](file:///c:/dev/sokna/components/update-password-form.tsx)
- 세션 프록시: [proxy.ts](file:///c:/dev/sokna/proxy.ts)
