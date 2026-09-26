# 공연 및 세션 관리 명세 (Gigs & Performers)

## 1. 기능 개요
동아리의 정기 공연, 버스킹, 연합 공연 등 공연 이벤트를 등록하고, 해당 공연에 참여하는 연주자(보컬, 악기 파트)들을 배정 및 조회하는 기능입니다.

---

## 2. 세부 명세

### 2.1 공연 목록 조회 (`/gigs`)
- 공개 범위는 **비공개(관리자만) / 회원 공개(로그인 회원) / 전체 공개(모든 방문자)**로 구분합니다. 목록·상세·메타데이터에 동일하게 적용합니다. 기존 비공개 공연은 회원 공개로 전환하며, 자세한 규칙은 [공연 공개 범위 명세](./gig-visibility.md)를 따릅니다.
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
  - 공개 범위 (`visibility`: 비공개 / 회원 공개 / 전체 공개, **기본값: 회원 공개**)
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
- 회원 공개 공연은 로그인한 모든 회원, 비공개 공연은 관리자만 열람합니다. 권한 없는 직접 URL 접근에서는 공연 제목·상세 정보·메타데이터를 숨깁니다.
- 로그인 회원은 회원 공개/전체 공개 공연에 참가 신청할 수 있으며, 비공개 공연 신청은 관리자로 제한합니다. 공연 수정은 관리자 전용이며 선곡회의는 조회 가능한 공연의 참여자·관리자에게만 허용합니다.
- 특정 공연을 선택하면 해당 공연의 세부 정보 페이지로 이동하며, 히어로 섹션 및 모바일 하단 플로팅 바에서 `공연 참여` 및 `선곡회의`(`app/gigs/[id]/nominations`)로 즉시 이동할 수 있습니다.
  - **히어로 정보**: 포스터, 공연 일시 및 장소와 함께 등록된 티켓 예매 정보(사전예매 / 현장구매 가격)를 표시합니다.
  - **비회원 권한 제어**: 비회원(로그아웃 상태) 사용자에게는 `공연 참여` 및 `선곡회의` CTA 버튼이 렌더링되지 않습니다.
- **공연 참가 신청 모달 (`GigJoinDialog`)**:
  - 별도 페이지 이동 없이 공연 상세 페이지 내 다이얼로그로 즉시 신청/수정 가능.
  - 다이얼로그 내에 포스터를 제외한 공연 핵심 정보(일시/시각, 장소)와 선곡회의 정보(일시/시각, 장소)를 카드 형태로 요약 표시.
  - 참여 상태(`going`, `not_going`, `undecided`), 희망 파트, 비고 입력을 지원하며 `submitGigRsvp` Server Action으로 저장.
  - 저장 전 공연/참여자 조회 오류는 서버 로그에 기록. 공연 조회에서 컬럼 누락(`42703`, `PGRST204`)이 발생하면 서버 설정 누락 안내를 표시하고 저장하지 않음. 다른 조회 실패는 기존 조회 실패 안내를 유지.
  - 최초 신청 및 무시된 신청은 참여 여부가 미선택 상태이며, 참여/불참/미정 중 하나를 선택해야 저장 가능.
  - 기본 세션 칩 외에 세션명을 직접 입력하고 `추가` 버튼 또는 Enter로 추가/선택 가능. 직접 입력한 세션은 기존 신청을 다시 열어도 원문 그대로 복원하며, 공용 기본 세션 목록은 변경하지 않음.
  - `going` 저장은 승인 대기이며, 실제 참여자 등록 여부는 해당 공연의 `performers.user_id`로 판별. 승인 전에는 시계 아이콘과 수정 가능한 버튼, 승인 후에는 초록 체크 아이콘과 비활성화된 `공연 참여` 버튼을 히어로/모바일 양쪽에 유지. 관리자가 직접 등록한 기존 공연자도 동일하게 처리.
  - 승인된 공연자는 `?join=true`로 다이얼로그를 자동으로 열 수 없으며, 서버 액션에서도 RSVP 재제출을 거부.
  - 기존 URL(`/gigs/[id]/join`) 접근 시 `/gigs/[id]?join=true`로 자동 리다이렉트되어 해당 다이얼로그를 오픈.
- 상단 액션 바에는 `공연 공유` 버튼이 노출되며, 관리자에게는 `공연 수정`(`/gigs/[id]/edit`) 버튼이 함께 제공됩니다.

#### 참가 신청 승인/무시
- 관리자 페이지(`/admin/members`)의 `참가 신청 현황`에서 여러 공연의 신청을 함께 조회. 공연 상세에는 신청 현황을 표시하지 않음.
- 각 신청은 `공연제목 | 이름 | 기수 | 신청세션 | 비고 | 승인 | 무시` 순서의 한 줄 표로 표시. 공연제목은 해당 공연 상세 링크이며, 모바일에서도 줄바꿈 없이 표 내부를 가로 스크롤. 승인 대기 칩은 표시하지 않음.
- 신청한 공연의 `performers`에 등록된 회원만 해당 신청에서 제외. 다른 공연의 참여 이력은 제외 조건이 아님.
- `going` 신청에는 **초록 체크(승인)** 및 **빨간 휴지통(무시)** 아이콘 버튼을 제공. 불참은 신청세션 칸에 `불참`으로 표시하며 승인/무시 칸은 `-` 처리.
- 미정(`undecided`) 응답은 조회 목록과 인원 집계 모두에서 제외. 요약에는 참여/불참 인원만 표시.
- `reviewGigRsvp` 액션과 `review_gig_rsvp` DB 함수가 모두 관리자 권한을 검사.
- 승인: 신청의 `gig_id`, `user_id`, `part`로 공연자를 등록하고 LINEUP을 갱신. 기존 공연자를 중복 등록하거나 파트/사진을 덮어쓰지 않음.
- 무시: 해당 RSVP를 삭제해 미신청/미선택 상태로 복원. 회원은 다시 참여 신청 가능.
- DB 함수는 신청 행을 잠그고 화면에서 읽은 `updated_at`을 비교하여 중복 처리, 무시 후 승인, 사용자가 수정한 오래된 신청 처리를 거부. 승인된 신청은 실제 공연자 연결로 구분하여 대기 목록에서 제외.
- 신청 제출/수정 및 승인/무시 시 `/admin/members` 캐시를 갱신. 승인/무시 후에는 공연 목록/상세/수정/선곡회의 캐시도 갱신. 다른 사용자의 열려 있는 화면은 재방문 또는 새로고침 시 최신 상태를 반영.
- 배포 시 `20260926000000_review_gig_rsvps.sql` 및 `20260926001000_restrict_gig_rsvp_rpc.sql` 적용 필요. 기존 테이블 컬럼 변경은 없음. 두 번째 마이그레이션은 Supabase 기본 권한으로 부여될 수 있는 `anon`의 직접 함수 실행 권한을 회수.
- 2026-09-26 SOKNA 운영 DB에 두 마이그레이션을 적용하고 이력을 기록. 승인 함수 존재, 관리자 조회 정책, API의 함수 인식 및 비로그인 호출 차단을 확인. 기존 신청은 자동 승인/삭제하지 않으며 관리자가 화면에서 다시 처리.
- 승인 DB 함수가 없거나 API 스키마 캐시에 반영되지 않은 경우(`PGRST202`, `42883`)에는 단순 재시도 안내 대신 서버 설정 누락 안내를 표시. SQL 파일이 로컬에 존재하는 것만으로 운영 DB 적용 완료로 보지 않으며, 배포 후 함수 존재와 마이그레이션 이력을 확인.
- 회귀 검증: `node --test tests/gig-rsvp.test.mjs`로 서버 권한/신청 검증과 PC·모바일 승인 버튼, 미선택 상태, 직접 입력 세션 복원을 확인.

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
  - 공개 범위 (`visibility`: 비공개 / 회원 공개 / 전체 공개)
  - 참여 공연자 명단 (`performers`):
    - 세션원 추가 및 삭제
    - 개별 세션원의 담당 파트 수정
    - 공연별 세션 프로필 사진 업로드 및 수정
- **처리 절차 (`updateGig` Server Action)**:
  1. `getIsAdmin()` 검증.
  2. `gigs` 테이블의 기본 정보(`title`, `subtitle`, `advance_ticket_price`, `door_ticket_price`, `perform_date`, `meeting_date`, `location`, `meeting_location`, `poster_url`, `visibility`) update. 호환용 `is_public`은 전체 공개 여부로 동기화.
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
