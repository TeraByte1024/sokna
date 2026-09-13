# 14. 관리자 회원 관리 페이지 (`/admin/members`)

## 1. 개요 및 접근 권한
- **URL 경로**: `/admin/members`
- **대상 사용자**: **동아리 관리자(Admin)**
- **목적**:
  - 가입 신청 중인 대기 회원의 승인 / 거절 처리.
  - 승인된 정식 부원의 실명, 기수, 세션 파트 정보 수정.
  - 관리자 권한 부여 및 회수.
  - 부원 명단 검색 및 관리.

---

## 2. 주요 기능 및 사용자 인터랙션

### 2.1 가입 승인 대기 명단
- 신규 회원이 가입 신청하거나 소셜 로그인으로 프로필을 완성하면 대기 명단에 표시됩니다.
- `[승인]` 버튼 클릭 시 즉시 정식 부원으로 승인되어 부원 명단 열람 권한이 부여됩니다.
- `[거절]` 버튼 클릭 시 확인 후 대기 상태가 반려됩니다.

### 2.2 부원 정보 수정 (모달 다이얼로그)
- 승인된 회원 목록의 각 카드에서 `[수정(연필 아이콘)]`을 클릭하면 회원 정보 수정 모달이 열립니다.
- 수정 가능 항목:
  - 이름 (실명)
  - 기수 (1 이상의 정수)
  - 세션 파트 (보컬, 기타, 베이스, 드럼, 건반, 창작 프리셋 칩 또는 직접 입력)
- 저장 시 서버 액션(`updateMemberByAdminAction`)을 통해 안전하게 데이터베이스를 업데이트합니다.

### 2.3 작성 중 이탈 방지 (`LeaveConfirmDialog`)
- 회원 정보 수정 모달에서 내용(이름, 기수, 세션)을 수정한 상태(`isEditDirty`)에서:
  - 모달의 `[취소]` 버튼, `[X]` 닫기 버튼 또는 어두운 배경 영역 클릭
  - 네비게이션 헤더의 다른 페이지 링크 클릭
  - 브라우저 새로고침, 탭 닫기, 뒤로가기
- 위 상황 발생 시 `LeaveConfirmDialog` 경고 팝업이 노출되어 변경사항이 유실되지 않도록 보호합니다.

### 2.4 관리자 권한 관리
- 관리자 권한 부여: 대상 부원의 이메일 입력 후 권한 추가.
- 관리자 권한 회수: 기존 관리자 목록에서 대상자 권한 해제 (단, 마지막 1인의 관리자 권한은 회수 불가).

---

## 3. 관련 소스 코드 파일
- 페이지 라우트: [app/admin/members/page.tsx](file:///c:/dev/sokna/app/admin/members/page.tsx)
- 클라이언트 컴포넌트: [app/admin/members/admin-members-client.tsx](file:///c:/dev/sokna/app/admin/members/admin-members-client.tsx)
- 관리자 서버 액션: [app/admin/members/actions.ts](file:///c:/dev/sokna/app/admin/members/actions.ts)
- 공통 이탈 확인 모달: [components/ui/leave-confirm-dialog.tsx](file:///c:/dev/sokna/components/ui/leave-confirm-dialog.tsx)
