# 공연 및 세션 관리 명세 (Gigs & Performers)

## 1. 기능 개요
동아리의 정기 공연, 버스킹, 연합 공연 등 공연 이벤트를 등록하고, 해당 공연에 참여하는 연주자(보컬, 악기 파트)들을 배정 및 조회하는 기능입니다.

---

## 2. 세부 명세

### 2.1 공연 목록 조회 (`/gigs`)
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
  - 공연 제목 (`title`, 필수)
  - 공연 일시 (`perform_date`, 필수)
  - 총회 일시 (`meeting_date`, 선택)
  - 참여자 목록 (`performers`, JSON 포맷):
    - `id`: 유저 UUID
    - `name`: 이름
    - `part`: 배정 파트
- **처리 절차 (`createGig` Server Action)**:
  1. `getIsAdmin()` 확인 (비관리자 시 차단).
  2. `gigs` 테이블에 insert 후 생성된 `id` 취득.
  3. `performersList`를 순회하며 `performers` 매핑 테이블에 `gig_id`와 `performer_id` (또는 `user_id`, `part`) 삽입.
  4. `revalidatePath("/gigs")` 호출로 캐시 갱신.

### 2.3 공연 상세 및 셋리스트 진입 (`/gigs/[id]`)
- 특정 공연을 선택하면 해당 공연의 세부 정보 및 셋리스트(`app/gigs/[id]/setlists`) 페이지로 이동합니다.

---

## 3. 관련 파일 링크
- 공연 목록 페이지: [app/gigs/page.tsx](file:///c:/dev/sokna/app/gigs/page.tsx)
- 공연 목록 렌더링 컴포넌트: [app/gigs/gigs-inner.tsx](file:///c:/dev/sokna/app/gigs/gigs-inner.tsx)
- 공연 생성 페이지: [app/gigs/new/page.tsx](file:///c:/dev/sokna/app/gigs/new/page.tsx)
- 공연 서버 액션: [app/gigs/actions.ts](file:///c:/dev/sokna/app/gigs/actions.ts)
- 공연 데이터 타입 및 매퍼: [lib/gig.ts](file:///c:/dev/sokna/lib/gig.ts)
- 참여자 선택 UI: [components/performer-selector.tsx](file:///c:/dev/sokna/components/performer-selector.tsx)
