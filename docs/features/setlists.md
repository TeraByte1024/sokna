# 셋리스트 및 선곡 관리 명세 (Setlists & Nominations)

## 1. 기능 개요
특정 공연(`gig_id`)에 참여하는 멤버들이 연주할 후보곡을 등록(`nominations`)하고, 곡별 필요 세션(보컬, 기타, 베이스, 드럼, 건반 등), 악보 보유 여부, 참고 링크(유튜브, 음원 등), 상세 설명을 공유하고 협업하는 기능입니다. 선곡 회의가 완료된 후 실제 공연에 오를 확정 곡 목록은 `setlists` 테이블로 분리 관리되며, 공연 수정 화면에서 선곡회의 후보곡을 쉽게 텍스트 복사하여 셋리스트로 일괄 추가할 수 있습니다.

---

## 2. 세부 명세

### 2.1 선곡회의 후보곡 목록 및 상세 패널 (`/gigs/[id]/nominations`)
- **접근 권한 (보안 검사)**:
  - **화면 접근 권한**: 오직 **해당 공연의 참여 세션원(`performers`) 및 관리자(`is_admin()`)**만 접근 가능.
  - 비로그인 사용자는 로그인 페이지로 자동 리다이렉트되며, 비참여 부원은 "공연 참여자 전용 화면" 안내 뷰를 표시하여 정보 노출을 차단합니다.
- **조회 조건**:
  - `nominations` 테이블에서 `gig_id == [id]`에 해당하는 모든 후보곡을 **항상 등록순(처음 등록한 것이 위로 오도록 오름차순)**으로 조회 및 정렬 표시.
  - 곡 등록자(`created_by` -> `performers` -> `users`) 정보를 조인하여 기수, 파트, 작성자 이름 표시.
- **주요 UI 요소**:
  - `SetlistPanel`: 히어로 배너, D-Day & 마감 카운트다운 타이머, 실시간 검색 및 3대 확장 필터(세션, 응답, 악보) 토글 바, 곡 카드 그리드 (항상 등록순 정렬).
  - `PartChip`: 필요 악기 세션 파트 뱃지 (flat 스타일, `보컬(남)`/`보컬(여)` 표준화, **보컬 -> 코러스 -> 기타 -> 베이스 -> 드럼 -> 건반 -> 이외** 일관된 순서로 자동 정렬). 곡 카드 목록에서는 불필요한 영상/링크 수 뱃지 제거, 썸네일 play 아이콘 제거(원본 썸네일 노출), 어필 텍스트의 쌍따옴표 및 이탤릭 서식 제거.
  - `SetlistDrawer`: 곡 기본 정보(타이틀, 아티스트, 추천자, 등록/수정 일시) -> **영상**(YouTube 동영상 임베드, 탭, 구간 우선 타임스탬프 퀵 칩, Full 설명) -> **어필**(작성자 설명) -> **악보**(악보 보유 상태 뱃지) -> **세션**(일관 정렬, **세션 버튼 클릭 시 해당 세션 참여자 응답 목록 팝업 `SessionResponsesDialog` 연동**) -> **나의 응답**(내 응답 상태 뱃지 및 가능 여부 응답 모달 버튼) 순서로 최적화 배치. (기존 드로어 내 '추천 보컬' 섹션은 제거되고, 세션 참여자 응답 목록 팝업 내 해당 보컬에게 '추천 보컬' 뱃지로 통합 표시). 서랍 열림 시 **배경(body) 스크롤 고정(`overflow: hidden` 및 스크롤바 너비 보정)** 및 `overscroll-contain`, ESC 키 닫기를 적용하여 이중 스크롤바 및 배경 스크롤 누수를 방지. 권한자(직접 등록한 부원/관리자)에게 헤더 [수정] 버튼 제공.
  - `SetlistNewModal` & `SetlistEditModal`: 곡 기본 정보, **악보 상태 세그먼트(`악보`: `악보 있어요` / `악보 없어요`)**, `세션` 파트 칩 추가 및 고정 정렬(보컬 > 코러스 > 기타 > 베이스 > 드럼 > 건반 > 이외), 세션 안내 텍스트 및 모바일 툴팁(`CircleHelp`), 선택된 세션 우측 상단 `총 n명` 카운트, `+ 직접 입력` 아이콘 분리, **`추천 보컬`**(보컬 부원 상단 우선 정렬, 다중 지정), **참고 링크**(영상 설명 입력 필드 내부에 타임스탬프가 인라인 버튼 뱃지로 렌더링되는 `RichTimestampTextarea` 적용, 백스페이스 및 `×` 클릭 시 구간 일괄 삭제 지원, 실시간 영상 미리보기 플레이어 및 클릭 시 재생 위치 이동), 어필 작성/수정. (수정 모달 하단 좌측에 `[추천곡 삭제하기]` 배치, 모달 활성 시 배경 스크롤 고정 및 ESC 지원).

### 2.2 곡 등록 (`SetlistNewModal` & `addSetlist`)
- **등록 자격 (보안 검사)**:
  - 로그인된 유저가 해당 공연(`gig_id`)의 `performers` 테이블에 등록되어 있어야 함 (`user_id` & `gig_id`) 또는 관리자 권한(`is_admin()`).
  - 일반 참여자는 접수 마감 시각(`meeting_date` 24시간 전) 전까지만 등록할 수 있으나, **관리자(Admin)는 접수 마감 이후에도 상시 등록 가능**.
  - 참여자나 관리자가 아닐 경우 `"이 공연의 참여자로 등록되지 않았습니다."` 에러 반환.
- **입력 데이터 구조**:
  ```ts
  export interface SetlistFormValues {
    title: string;          // 곡 제목
    artist: string;         // 아티스트명
    requiredParts: string[]; // 필요 세션 배열 (예: ['보컬(남)', '기타', '드럼'])
    recommendedVocals: {    // 추천 보컬 목록 (jsonb)
      id: number;           // performer id
      name: string;
      generation?: number | null;
      part?: string;
    }[];
    sheetExists: boolean;   // 악보 보유 여부
    description: string;    // 메모 및 특이사항
    links: {                // 참고 URL 목록 (jsonb)
      url: string;
      note?: string;
      timestamp?: string;
    }[];
  }
  ```
- **데이터베이스 반영**:
  - `nominations` 테이블에 insert.
  - `created_by` 컬럼에는 유저의 `performers.id`가 저장됨.
  - `recommended_vocals` 컬럼(jsonb)에 추천 보컬 목록 저장.
  - 등록 완료 후 `revalidatePath('/gigs/${gigId}/nominations')`로 갱신.

### 2.3 곡 삭제 및 수정 권한 분리 (`deleteSetlist`, `updateSetlist` & RLS)
- **선곡회의 후보곡 (`nominations`)**:
  - **오직 본인이 직접 등록한 부원(`created_by`) 또는 관리자(`is_admin()`)만 추가/수정/삭제 가능**.
  - Server Action 및 DB RLS 양쪽에서 본인 등록 여부를 엄격하게 검증하여 타 부원의 후보곡 임의 수정/삭제 방지.
- **공연 정보 확정 셋리스트 (`setlists`)**:
  - **오직 관리자(Admin)만 등록/삭제 및 수정 가능** (공연 관리 폼 `updateGig`을 통해서만 반영).
  - 일반 부원은 공연 셋리스트를 임의로 수정하거나 삭제할 수 없습니다.

### 2.4 [선곡회의 곡 가져오기] 다이얼로그 (`NominationImportDialog`)
- **목적**: 선곡 회의에서 제안된 곡 중 실제 공연에 오를 곡들을 공연 관리자가 손쉽게 선택하여 공연 셋리스트(`setlists`)로 텍스트 복사 추가.
- **접근 경로**: 공연 정보 수정 페이지(`/gigs/:id/edit`)의 SETLIST 관리 헤더의 `[선곡회의 곡 가져오기]` 버튼.
- **동작 흐름**:
  1. 버튼 클릭 시 해당 공연의 `nominations` 목록을 불러오는 모달 표시.
  2. 실시간 검색(곡 제목, 아티스트, 추천인, 세션) 및 다중 선택 체크박스(전체 선택/해제 지원) 제공.
  3. 세션 뱃지는 표준화된 순서(보컬 -> 기타 -> 베이스 -> 드럼 -> 건반 -> 이외)로 정렬 표시되며, 추천 보컬 정보도 함께 제공.
  4. [선택한 N곡 추가하기] 클릭 시, 선택된 곡의 제목, 아티스트 및 기본 세션 슬롯(추천 보컬 자동 배정 포함) 정보를 셋리스트 행으로 자동 추가.
  5. 기존 스프레드시트 붙여넣기 기능(`SetlistBulkImporter`)과 완벽히 병행하여 사용 가능.

### 2.5 후보곡별 세션 참여 가능 여부 및 메모 (`nomination_responses`)
- **목적**: 공연 참여 세션원들이 선곡회의 후보곡 각각에 대해 자신의 연주/보컬 참여 가능 여부를 표시하고, 곡에 대한 세션 조율 메모(예: 솔로 카피 필요, 키 조절 희망 등)를 남길 수 있도록 지원합니다.
- **가능 여부 상태 (3종)**:
  - `available` (가능 🟢)
  - `undecided` (미선택 ⚪, 기본값)
  - `unavailable` (불가능 🔴)
- **메모 (`comment`)**:
  - 선택 사항으로 텍스트 입력 가능.
  - 후보곡의 세션별로 상태 및 메모를 저장(`UNIQUE(nomination_id, user_id, session_part)`). 복수 세션을 부여받은 부원은 각 세션별로 독립적인 응답 가능.
  - **Local Custom 세션**: 곡 추천자가 추가한 세션 중 공연 기본 세션에 속하지 않는 세션은 곡끼리 공유되지 않으며, 세션 배정과 무관하게 모든 공연 참여자가 자유롭게 응답 가능.
- **UI 및 동작 흐름**:
  1. **곡 상세 서랍(`SetlistDrawer`) 내 세션 버튼 및 내 응답 섹션**:
     - **세션 뱃지 색상 통일**: `보컬(남)`과 `보컬(여)`의 남/여 구분 색상(파랑/빨강)을 제거하고, 다른 일반 세션 뱃지와 동일한 중립 카드 스타일로 통일.
     - **필요 세션 뱃지 클릭 시 응답 현황 팝업 (`SessionResponsesDialog`)**:
       - 곡의 필요 세션 목록에서 각 세션 뱃지(보컬, 기타, 베이스, 드럼, 건반 등)를 클릭하면 `SessionResponsesDialog` 모달이 즉시 열려 해당 세션 공연 참여자들의 응답 상태(🟢 가능 / 🔴 불가능 / ⚪ 미선택)와 메모를 확인 가능.
       - **추천 보컬 뱃지 통합 표시**: 드로어 본문의 '추천 보컬' 섹션을 제거하고, 응답 현황 팝업의 해당 보컬 참여자 행에 `[추천 보컬]` 뱃지를 표시하며 정렬 우선순위(본인 다음 상단)를 부여하여 가독성과 직관성을 극대화.
     - **곡 상세 섹션 순서 최적화**:
       - 곡 감상 및 검토 흐름에 맞춰 **`영상 > 어필 > (악보 상태) 악보 > 세션 > 나의 응답`** 순으로 섹션을 재배치하여 부원들이 영상을 보고, 추천 어필을 읽은 뒤, 악보와 필요 세션을 확인하고 자신의 참여 가능 여부를 최종 등록할 수 있도록 최적의 UX를 제공.
  2. **후보곡 목록 카드(`SetlistCard`)**:
     - 카드의 세션 파트 하단에 응답 요약 뱃지(`🟢 가능 X명`, `🔴 불가능 Y명`, `내 응답: 가능/불가능`) 노출.
  3. **상단 필터 툴바**:
     - 별도 [필터] 아이콘 버튼을 통해 확장/축소되는 3가지 필터 패널 제공:
       - **세션 필터**: `전체`, `보컬(남)`, `보컬(여)`, `건반` (기타, 베이스, 드럼 항목 제외)
       - **내 응답 필터**: `전체`, `가능`, `불가능`, `미선택`
       - **악보 필터**: `전체`, `악보 있음`, `악보 없음`
     - 필터 패널이 닫혀있을 때도 활성화된 필터 개수 뱃지 및 빠른 해제 칩을 노출하여 직관적으로 필터 상태 확인 및 초기화 가능.
     - 최신순/가나다순 정렬 토글 버튼을 제거하고, 항상 최초 등록순(과거 등록된 곡이 상단)으로 일관되게 정렬 표시.

---

## 3. 관련 파일 링크
- 선곡회의 페이지: [app/gigs/[id]/nominations/page.tsx](file:///d:/dev/sokna/app/gigs/[id]/nominations/page.tsx)
- 선곡회의 서버 액션: [app/gigs/[id]/nominations/actions.ts](file:///d:/dev/sokna/app/gigs/[id]/nominations/actions.ts)
- 선곡회의 데이터 모델: [lib/nomination.ts](file:///d:/dev/sokna/lib/nomination.ts) (호환용: [lib/setlist.ts](file:///d:/dev/sokna/lib/setlist.ts))
- 선곡회의 메인 패널: [components/nominations/nomination-panel.tsx](file:///d:/dev/sokna/components/nominations/nomination-panel.tsx)
- 선곡회의 등록 모달: [components/nominations/nomination-new-modal.tsx](file:///d:/dev/sokna/components/nominations/nomination-new-modal.tsx)
- 선곡회의 상세 드로어: [components/nominations/nomination-drawer.tsx](file:///d:/dev/sokna/components/nominations/nomination-drawer.tsx)
- 선곡회의 세션 응답 섹션: [components/nominations/nomination-response-section.tsx](file:///d:/dev/sokna/components/nominations/nomination-response-section.tsx)
- 선곡회의 외부 링크 배너 카드: [components/nominations/external-link-card.tsx](file:///d:/dev/sokna/components/nominations/external-link-card.tsx)
- 선곡회의 곡 가져오기 다이얼로그: [components/gigs/nomination-import-dialog.tsx](file:///d:/dev/sokna/components/gigs/nomination-import-dialog.tsx)
- DB 마이그레이션 파일: [supabase/migrations/20260917020000_create_nomination_responses.sql](file:///d:/dev/sokna/supabase/migrations/20260917020000_create_nomination_responses.sql)
- DB 세션별 응답 마이그레이션 파일: [supabase/migrations/20260918000000_update_nomination_responses_session_part.sql](file:///d:/dev/sokna/supabase/migrations/20260918000000_update_nomination_responses_session_part.sql)

