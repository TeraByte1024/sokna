# 13. 회원 정보 수정 페이지 (`/profile`) [로그인 회원 전용]

## 1. 개요 및 접근 권한
- **URL 경로**: `/profile`
- **대상 사용자**: **로그인한 동아리 회원 전용**
- **목적**: 본인의 회원 정보(이름, 기수, 담당 세션 파트, 행사 소식 수신 동의)를 확인 및 수정.
- **보안 및 권한 정책**:
  - 비로그인 사용자는 `/auth/login?redirect=/profile`로 자동 리다이렉트.

---

## 2. 디자인 및 화면 레이아웃 (Layout & Visuals)

- 계정 기본 정보 카드: 가입 이메일, 승인 상태, 가입 신청일, 승인일.
- 회원 정보 수정 폼:
  - 이름(실명) 입력 필드.
  - 기수(숫자) 입력 필드.
  - 담당 세션(파트) 프리셋 버튼(`보컬`, `기타`, `베이스`, `드럼`, `건반`, `창작`, `직접 입력`).
  - 행사 소식 이메일 수신 동의 체크박스.
  - `[변경사항 저장하기]` 버튼.

---

## 3. 사용자 인터랙션 및 UX 흐름

1. **정보 조회 및 폼 초기화**:
   - `users` 테이블에서 현재 로그인 사용자의 정보를 불러와 기본값으로 바인딩.
2. **정보 수정 및 저장 (`updateMyProfileAction`)**:
   - 이름, 기수, 파트, 수신 동의 여부를 변경하고 `[변경사항 저장하기]` 클릭 시 DB에 반영 및 토스트 알림 표시.
3. **페이지 이탈 방지 확인 팝업 (`LeaveConfirmDialog` 및 `beforeunload`)**:
   - 폼 작성 및 수정 중(`isDirty`) 사용자가 상단 네비게이션, 헤더 링크 클릭 또는 브라우저 탭 닫기/새로고침을 시도할 경우 변경사항 유실을 방지하기 위한 확인 팝업("페이지를 벗어나시겠습니까?")을 표시합니다.
   - 저장 완료 시에는 정상 제출 플래그(`markSubmitting()`)를 통해 팝업 없이 즉시 최신 상태가 반영됩니다.

---

## 4. 관련 파일 링크
- 페이지 라우트: [app/profile/page.tsx](file:///d:/dev/sokna/app/profile/page.tsx)
- 프로필 폼 컴포넌트: [app/profile/profile-form.tsx](file:///d:/dev/sokna/app/profile/profile-form.tsx)
- 프로필 수정 서버 액션: [app/profile/actions.ts](file:///d:/dev/sokna/app/profile/actions.ts)
- 공통 이탈 확인 다이얼로그: [components/ui/leave-confirm-dialog.tsx](file:///d:/dev/sokna/components/ui/leave-confirm-dialog.tsx)
