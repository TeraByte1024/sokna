# 공연 및 세션 관리 명세 (Gigs & Performers)

## 1. 기능 개요
동아리의 정기 공연, 버스킹, 연합 공연 등 공연 이벤트를 등록하고, 해당 공연에 참여하는 연주자(보컬, 악기 파트)들을 배정 및 조회하는 기능입니다.

---

## 2. 세부 명세

### 2.1 공연 목록 조회 (`/gigs`)
- 공개 공연은 모든 방문자에게 표시합니다. 비공개 공연은 관리자와 `performers.user_id`로 연결된 해당 공연 참여자에게만 표시합니다.
- **분류 표시**:
  - `upcomingGigs`: 오늘 날짜 이후의 예정된 공연 (가까운 순서로 정렬, D-Day 표시)
  - `pastGigs`: 지난 공연 (최신순 정렬)
- **표시 정보**:
  - 공연 제목 (`title`)
  - 공연 일시 (`perform_date`)
  - 곡 선정 및 준비 총회 일시 (`meeting_date`)
- **관리자 전용 기능**:
  - 관리자(`isAdmin === true`)에게만 우측 상단 `공연 등록` 버튼 노출 (`/gigs/new`).

### 2.2 공연 등록 (`/gigs/new`)
- **접근 권한**: 관리자 전용 (`getIsAdmin()` 검증).
- **입력 항목**:
  - 포스터 이미지 (`poster_url`, 업로드/미리보기, 데스크톱 기준 좌측 배치)
  - 공연 제목 및 부제목 (`title` 필수, `subtitle` 선택, 데스크톱 기준 우측 배치)
  - 사전예매 및 현장예매 가격 (`advance_ticket_price`, `door_ticket_price`, 정수 KRW, 선택)
  - 공연 일시 및 시각 (`perform_date`, 일자 및 24hh:mm 시각, 필수)
  - 공연 장소 (`location`, 선택)
  - 선곡회의 일시 및 시각 (`meeting_date`, 일자 및 24hh:mm 시각, 선택)
  - 선곡회의 장소 (`meeting_location`, 선택)
  - 공개 여부 (`is_public`: 비공개 / 공개, **기본값: 비공개**)
  - 참여자 목록 (`performers`, JSON 포맷):
    - `id`: 유저 UUID
    - `name`: 이름
    - `part`: 배정 파트
- **처리 절차 (`createGig` Server Action)**:
  1. `getIsAdmin()` 확인 (비관리자 시 차단).
  2. `gigs` 테이블에 insert 후 생성된 `id` 취득.
  3. `performersList`를 순회하며 `performers` 매핑 테이블에 `gig_id`와 `performer_id` (또는 `user_id`, `part`) 삽입.
  4. `revalidatePath("/gigs")` 호출로 캐시 갱신.

### 2.3 공연 상세 및 참가 신청 / 선곡회의 진입 (`/gigs/[id]`)
- 비공개 공연 상세는 관리자와 `performers.user_id`로 연결된 해당 공연 참여자만 열람할 수 있습니다. 일반 회원은 직접 URL로 접근해도 차단합니다.
- 특정 공연을 선택하면 해당 공연의 세부 정보 페이지로 이동하며, 히어로 섹션 및 모바일 하단 플로팅 바에서 `공연 참여` 및 `선곡회의`(`app/gigs/[id]/nominations`)로 즉시 이동할 수 있습니다.
  - **히어로 정보**: 포스터, 공연 일시 및 장소와 함께 등록된 티켓 예매 정보(사전예매 / 현장구매 가격)를 표시합니다.
  - **비회원 권한 제어**: 비회원(로그아웃 상태) 사용자에게는 `공연 참여` 및 `선곡회의` CTA 버튼이 렌더링되지 않습니다.
- **공연 참가 신청 모달 (`GigJoinDialog`)**:
  - 별도 페이지 이동 없이 공연 상세 페이지 내 다이얼로그로 즉시 신청/수정 가능.
  - 다이얼로그 내에 포스터를 제외한 공연 핵심 정보(일시/시각, 장소)와 선곡회의 정보(일시/시각, 장소)를 카드 형태로 요약 표시.
  - 참여 상태(`going`, `not_going`, `undecided`), 희망 파트, 비고 입력을 지원하며 `submitGigRsvp` Server Action으로 저장.
  - 기존 URL(`/gigs/[id]/join`) 접근 시 `/gigs/[id]?join=true`로 자동 리다이렉트되어 해당 다이얼로그를 오픈.
- 상단 액션 바에는 `공연 공유` 버튼이 노출되며, 관리자에게는 `공연 수정`(`/gigs/[id]/edit`) 버튼이 함께 제공됩니다.

### 2.4 공연 정보 수정 (`/gigs/[id]/edit`)
- **접근 권한**: 관리자 전용 (`getIsAdmin()` 검증 후 비인가자 리다이렉트).
- **수정 가능 항목**:
  - 공연 제목 (`title`, 필수) 및 부제목 (`subtitle`)
  - 사전예매 가격 (`advance_ticket_price`) 및 현장예매 가격 (`door_ticket_price`, 정수 KRW)
  - 공식 포스터 이미지 (`poster_url`, 업로드/교체/삭제, 포스터 | 제목, 포스터 | 부제목 레이아웃)
  - 공연 일시 및 시각 (`perform_date`, 24hh:mm, 필수)
  - 공연 장소 (`location`, 선택)
  - 선곡 회의 일시 및 시각 (`meeting_date`, 24hh:mm, 선택)
  - 선곡 회의 장소 (`meeting_location`, 선택)
  - 공개 여부 (`is_public`: 비공개 / 공개)
  - 참여 공연자 명단 (`performers`):
    - 세션원 추가 및 삭제
    - 개별 세션원의 담당 파트 수정
    - 공연별 세션 프로필 사진 업로드 및 수정
- **처리 절차 (`updateGig` Server Action)**:
  1. `getIsAdmin()` 검증.
  2. `gigs` 테이블의 기본 정보(`title`, `subtitle`, `advance_ticket_price`, `door_ticket_price`, `perform_date`, `meeting_date`, `location`, `meeting_location`, `poster_url`, `is_public`) update.
  3. 참여자(Performers) 지능형 동기화 (Diff/Upsert):
     - 기존 `performers` 목록과 새 목록 비교.
     - 유지되는 참여자는 파트/프로필 사진 변경사항만 update하여 고유 `performers.id` 보존 (`setlists.created_by` FK 무결성 유지).
     - 제외된 참여자는 연관된 `setlists.created_by`를 null 처리 후 안전 delete.
     - 새로 추가된 참여자는 insert.
  4. `revalidatePath` 호출로 `/gigs`, `/gigs/[id]`, `/gigs/[id]/edit` 캐시 갱신.

---

## 3. 관련 파일 링크
- 공연 목록 페이지: [app/gigs/page.tsx](file:///c:/dev/sokna/app/gigs/page.tsx)
- 공연 목록 렌더링 컴포넌트: [app/gigs/gigs-inner.tsx](file:///c:/dev/sokna/app/gigs/gigs-inner.tsx)
- 공연 생성 페이지: [app/gigs/new/page.tsx](file:///c:/dev/sokna/app/gigs/new/page.tsx)
- 공연 서버 액션: [app/gigs/actions.ts](file:///c:/dev/sokna/app/gigs/actions.ts)
- 공연 데이터 타입 및 매퍼: [lib/gig.ts](file:///c:/dev/sokna/lib/gig.ts)
- 참여자 선택 UI: [components/performer-selector.tsx](file:///c:/dev/sokna/components/performer-selector.tsx)
