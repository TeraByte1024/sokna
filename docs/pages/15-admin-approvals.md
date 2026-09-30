# 15. 가입/공연 신청 승인 (`/admin/approvals`)

## 접근과 화면

- 관리자 전용. 공통 관리자 메뉴에서 진입하며 `/admin`은 이 화면으로 이동한다.
- 가입 신청과 공연 참가 신청을 별도 표로 표시한다. 각 표는 대기 건수와 빈 목록·조회 실패 안내를 제공하고, 좁은 화면에서는 가로 스크롤한다.
- 가입 신청은 프로필을 완성한 대기 회원만 표시한다. 이름·기수·세션·이메일·신청일을 검토하고 정보 수정, 승인, 반려가 가능하다.
- 공연 신청은 `status = going` 및 `review_status = pending`이면서 아직 해당 공연의 `performers`에 없는 건만 표시한다. 공연·신청자·기수·희망 세션·비고를 확인하고 승인 또는 반려한다.

## 데이터 흐름

- 가입 승인: `approveMemberAction` → `approve_member_with_notification`. 가입 반려: `rejectMemberAction`으로 현재 `pending` 행만 갱신한다.
- 공연 승인·반려: `reviewGigRsvp(gigId, rsvpId, updatedAt, decision)` → `review_gig_rsvp` RPC. 행 잠금과 `updated_at` 비교로 중복·오래된 처리를 막는다.
- 승인 시 `performers` 등록과 RSVP `approved` 기록을 같은 트랜잭션에 저장한다. 반려 시 RSVP를 삭제하지 않고 `rejected`, 처리자, 처리 시각을 저장한다.
- 반려된 회원은 공연 신청을 다시 저장해 `pending`으로 재신청할 수 있다. 새 전환에 한 번만 관리자 알림을 생성한다.
- 처리 후 승인 화면, 공연 관리 화면, 관련 공연 상세·수정·선곡회의 캐시를 갱신한다.

## 상태와 예외

- 처리 중에는 중복 제출을 막는다. 반려 전에 대상자를 확인한다.
- 신청이 변경되거나 이미 처리된 경우 최신 내역을 다시 확인하도록 안내한다.
- 회원 정보 수정 중 이탈하면 기존 `LeaveConfirmDialog`로 경고한다.
