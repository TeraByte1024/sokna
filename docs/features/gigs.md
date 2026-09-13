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
- 관리자에게는 상단 액션 바에 `공연 수정`(`/gigs/[id]/edit`) 및 `참가 신청 링크 복사` 버튼이 노출됩니다.

### 2.4 공연 정보 수정 (`/gigs/[id]/edit`)
- **접근 권한**: 관리자 전용 (`getIsAdmin()` 검증 후 비인가자 리다이렉트).
- **수정 가능 항목**:
  - 공연 제목 (`title`, 필수)
  - 공연 일시 (`perform_date`, 필수)
  - 선곡 회의 일시 (`meeting_date`, 선택)
  - 공연 장소 (`location`, 선택)
  - 공식 포스터 이미지 (`poster_url`, 업로드/교체/삭제)
  - 공개 여부 설정 (`is_public`: 공개 / 비공개)
  - 참여 공연자 명단 (`performers`):
    - 세션원 추가 및 삭제
    - 개별 세션원의 담당 파트 수정
    - 공연별 세션 프로필 사진 업로드 및 수정
- **처리 절차 (`updateGig` Server Action)**:
  1. `getIsAdmin()` 검증.
  2. `gigs` 테이블의 기본 정보(`title`, `perform_date`, `meeting_date`, `location`, `poster_url`, `is_public`) update.
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
