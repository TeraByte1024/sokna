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
  - 곡 등록자(`created_by` -> `performers` -> `users`) 정보를 조인하여 기수, 파트, 작성자 이름 표시. 기수 정보가 확인되지 않거나 미연동된 공연자(스프레드시트 등록 등)의 경우 0기 대신 **이름만 단독 표시**하며, 공연 참여자 정보 조회 시 `user_id` 미연동 상태라도 사용자 프로필 이름 기반으로 fallback 매칭 지원.
- **주요 UI 요소**:
  - `NominationPanel`: 서버가 전달한 첫 조회 결과를 즉시 표시합니다. 히어로 배너의 제목 앞에 D-Day를 표시하고 별도 제목 아이콘 및 `선곡 회의 진행 중` 칩은 노출하지 않음. 마감 카운트다운 타이머, 실시간 검색 및 3대 확장 필터(세션, 응답, 악보) 토글 바, 곡 카드 그리드(항상 등록순 정렬)를 제공. 모바일에서는 후보곡 추천 액션을 우측 하단의 원형 `+` 플로팅 버튼으로 제공하며, 데스크톱에서는 기존 텍스트 버튼을 표시.
  - `PartChip`: 필요 악기 세션 파트 뱃지 (flat 스타일, `보컬(남)`/`보컬(여)` 표준화, **보컬 -> 코러스 -> 기타 -> 베이스 -> 드럼 -> 건반 -> 이외** 일관된 순서로 자동 정렬). 모든 화면 크기에서 곡 카드 정보 영역은 **`곡 제목 - 아티스트 | 상세보기` → `필요 세션·악보 | 나의 응답` → `어필 | 작성자`**의 3행 위치 구조로 통일하되, `상세보기`는 기존처럼 데스크톱 hover 시에만 노출하고 작성자는 기존 중립 칩 스타일을 유지. 전체 가능/불가능 인원 집계는 노출하지 않고, 공연 참가자인 경우에만 사용자의 응답을 세션별 칩(`베이스 가능`, `코러스 불가능` 등)으로 표시. 악보 칩은 필요 세션 끝에 배치하며 모바일에서는 `악보 O`/`악보 X`, `sm` 이상에서는 `악보 있음`/`악보 없음`으로 표시. 썸네일은 **유튜브 표준 16:9 비율(`aspect-video`, 데스크톱 `sm:w-36 aspect-video`)**을 적용.
  - `NominationDrawer`: 처음 곡을 열 때 코드를 지연 로드합니다. 곡 기본 정보(타이틀, 아티스트, 추천자, 등록/수정 일시) -> **영상**(YouTube 동영상 임베드, 탭, 구간 우선 타임스탬프 퀵 칩, Full 설명) -> **어필**(작성자 설명) -> **악보**(악보 보유 상태 뱃지) -> **세션**(일관 정렬, **세션 버튼 클릭 시 해당 세션 참여자 응답 목록 팝업 `SessionResponsesDialog` 연동**) -> **나의 응답**(내 응답 상태 뱃지 및 가능 여부 응답 모달 버튼) 순서로 최적화 배치. 모바일에서는 `가능 여부 응답` 버튼을 드로어 하단에 고정하여 상세 내용을 스크롤하는 동안에도 항상 접근 가능하고, 데스크톱에서는 기존 응답 카드 내부 버튼을 유지. (기존 드로어 내 '추천 보컬' 섹션은 제거되고, 세션 참여자 응답 목록 팝업 내 해당 보컬에게 '추천 보컬' 뱃지로 통합 표시). 서랍 열림 시 **배경(body) 스크롤 고정(`overflow: hidden` 및 스크롤바 너비 보정)** 및 `overscroll-contain`, ESC 키 닫기를 적용하여 이중 스크롤바 및 배경 스크롤 누수를 방지. 권한자(직접 등록한 부원/관리자)에게 헤더 [수정] 버튼 제공 (클릭 시 `/gigs/[id]/nominations/[songId]/edit` 전용 페이지로 이동).
  - `NominationForm` (후보곡 등록/수정 전용 페이지 폼): 인풋 필드에서 Enter 입력 시 실수로 폼이 제출되지 않도록 방지, 곡 기본 정보, **악보 상태 세그먼트(`악보`: `악보 있어요` / `악보 없어요`) 및 악보 메모(`sheetNote`, 넉넉한 폭과 내용 초과 시 멀티라인 지원 Textarea)** 필드, **`필요 세션`**(신규 등록 시 기본값: **기타 1, 베이스 1, 드럼 1**, 추가 칩 및 고정 정렬: 보컬 > 코러스 > 기타 > 베이스 > 드럼 > 건반 > 이외), 세션 안내 텍스트 및 모바일 툴팁(`CircleHelp`), 선택된 세션 우측 상단 `총 n명` 카운트, `+ 직접 입력` 인라인 텍스트 필드, **`추천 보컬`**(컴팩트 칩 및 `+ 추가` 버튼 클릭 시 검색 인풋 전환 & 플로팅 드롭다운 팝업), **참고 링크**(유튜브 영상 레이아웃 순서: **1. 링크 URL → 2. 영상 미리보기 → 3. 타임스탬프 독립 목록/추가 → 4. 순수 설명 에디터**, **`[⏱️ 현재 시점 설명 추가]` 실시간 IFrame 재생 시간 캡처 및 일시정지**, 비유튜브 링크는 타임스탬프 숨김), 어필 작성/수정, 작성 중 이탈 방지 경고 팝업. 제목·아티스트뿐 아니라 악보, 필요 세션, 추천 보컬, 링크/타임스탬프 등 폼 전체 변경을 감지하며 상단 로고를 포함한 내부 링크 클릭도 확인 다이얼로그를 거침. (수정 페이지 하단 좌측에 `[🗑️ 추천곡 삭제하기]` 배치).

### 2.2 곡 등록 및 수정 (`NominationForm`, `addSetlist`, `updateSetlist`)
- **등록 및 수정 페이지 라우트**:
  - 신규 등록: `/gigs/[id]/nominations/new`
  - 정보 수정: `/gigs/[id]/nominations/[songId]/edit`
- **등록 자격 (보안 검사)**:
  - 로그인된 유저가 해당 공연(`gig_id`)의 `performers` 테이블에 등록되어 있어야 함 (`user_id` & `gig_id`) 또는 관리자 권한(`is_admin()`).
  - 일반 참여자는 접수 마감 시각(`meeting_date` 24시간 전) 전까지만 등록할 수 있으나, **관리자(Admin)는 접수 마감 이후에도 상시 등록 가능**.
  - 참여자나 관리자가 아닐 경우 `"이 공연의 참여자로 등록되지 않았습니다."` 에러 반환.
- **수정 자격 (보안 검사)**:
  - 후보곡 작성자 본인(`created_by`) 또는 관리자(`is_admin()`)만 수정 및 삭제 가능. 비인가 사용자 접근 시 차단 카드 렌더링.
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
    sheetNote?: string;     // 악보 관련 추가 메모 (키 정보, 보유 파트, 링크 등)
    description: string;    // 메모 및 특이사항 (기본 높이 5줄 이상)
    links: {                // 참고 URL 목록 (jsonb)
      url: string;
      note?: string;        // 순수 링크 설명 (기본 높이 5줄 이상)
      timestamp?: string;   // 호환용 시작 시각
      timestamps?: {        // 독립 타임스탬프 목록
        id?: string;
        time: string;       // 포맷: '1:23', '0:45', '1:23 ~ 2:45' (선행 0 strip)
        label: string;      // 구간 설명 (미입력 시 빈 문자열로 저장되며 UI에서 단독 표시)
      }[];
    }[];
  }
  ```
- **후보곡 폼 섹션 배치 순서**:
  - `1. 곡 기본 정보` (제목, 아티스트, 악보 보유 여부 및 메모)
  - `2. 필요 세션` (세션별 필요 인원 및 추천 보컬 선택)
  - `3. 어필 및 제안 메모` (추천 이유, 편곡 방향, 키 조절 등)
  - `4. 참고 링크` (유튜브 영상 링크, 미리보기, 타임스탬프, 설명)
- **수정 페이지 및 입력 UX 규칙**:
  - **타임스탬프 구간+설명 동시 입력 자동 파싱**: `TimestampBuilder`에서 `01:23 기타 솔로`, `02:5~02:15 기쏠`, `1:20 ~ 2:10 브릿지`와 같이 시간(초 단위 1자리 `02:5`도 `2:05`로 자동 보정)과 설명을 한 번에 입력하면 정규식을 통해 시간(선행 0 제거)과 설명을 자동으로 분리 파싱하며, 별도 2단계 확인 없이 엔터 한 번으로 즉시 타임스탬프가 추가됩니다.
  - **빠른 라벨 프리셋 제거**: 번거로운 고정 프리셋 버튼(+인트로, +벌스 등)을 제거하여 인터페이스를 단순화하고 사용자의 자유로운 직접 입력을 극대화.
  - **추천 보컬 선택기 키보드 지원 및 간소화**: 드롭다운 상단의 불필요한 헤더(`공연 참여자 목록 | n명`)를 제거하고, 위/아래 방향키(`↑`, `↓`)로 참여자 항목 포커스 이동 및 `Enter` 키로 즉시 선택/토글할 수 있도록 키보드 네비게이션을 전면 지원.
  - **영상 미리보기 즉시 렌더링**: 수정 페이지 진입 시 등록된 YouTube 영상을 대기/지연 없이 즉시 렌더링하며, 불필요한 자동재생(`autoplay=1`)으로 인한 브라우저 차단/정지 현상을 방지. 타임스탬프 칩 클릭 시에만 `postMessage` 기반으로 부드럽게 점프 및 재생.
  - **타임스탬프 시간 표기 0 strip**: `01:23` -> `1:23`, `00:45` -> `0:45`, `00:00` -> `0:00`, `01:23 ~ 02:45` -> `1:23 ~ 2:45`와 같이 분/시간 단위 선행 0을 제거하여 간결하고 읽기 쉽게 표시.
  - **타임스탬프 버튼 줄바꿈(Wrap) 및 전체 표시**: 타임스탬프 설명이 길어지거나 여러 개가 등록되더라도 말줄임표(`truncate`)로 잘리지 않고, `flex-wrap` 및 `break-words`를 통해 block 단위로 자연스럽게 줄바꿈되어 모든 타임스탬프와 설명 내용이 온전히 표시됩니다. (등록 폼 및 상세 드로어 공통 적용)
  - **타임스탬프 단독 표기**: 설명이 없거나 '주요 구간', '지정 구간' 등의 기본 플레이스홀더인 경우 라벨을 강제로 노출하지 않고 `[▶ 1:23]` 타임스탬프만 단독 표시.
- **데이터베이스 반영**:
  - `nominations` 테이블에 insert / update.
  - `created_by` 컬럼에는 유저의 `performers.id`가 저장됨.
  - `sheet_note` 컬럼에 악보 메모 저장.
  - `recommended_vocals` 컬럼(jsonb)에 추천 보컬 목록 저장.
  - 등록 및 수정 완료 후 `revalidatePath('/gigs/${gigId}/nominations')`로 갱신.

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
  1. **곡 상세 서랍(`NominationDrawer`) 내 세션 버튼 및 내 응답 섹션**:
     - **세션 뱃지 색상 통일**: `보컬(남)`과 `보컬(여)`의 남/여 구분 색상(파랑/빨강)을 제거하고, 다른 일반 세션 뱃지와 동일한 중립 카드 스타일로 통일.
     - **필요 세션 뱃지 클릭 시 응답 현황 팝업 (`SessionResponsesDialog`)**:
       - 곡의 필요 세션 목록에서 각 세션 뱃지(보컬, 기타, 베이스, 드럼, 건반 등)를 클릭하면 `SessionResponsesDialog` 모달이 즉시 열려 해당 세션 공연 참여자들의 응답 상태(🟢 가능 / 🔴 불가능 / ⚪ 미선택)와 메모를 확인 가능.
       - **추천 보컬 뱃지 통합 표시**: 드로어 본문의 '추천 보컬' 섹션을 제거하고, 응답 현황 팝업의 해당 보컬 참여자 행에 `[추천 보컬]` 뱃지를 표시하며 정렬 우선순위(본인 다음 상단)를 부여하여 가독성과 직관성을 극대화.
     - **곡 상세 섹션 순서 최적화**:
       - 곡 감상 및 검토 흐름에 맞춰 **`영상 > 어필 > (악보 상태) 악보 > 세션 > 나의 응답`** 순으로 섹션을 재배치하여 부원들이 영상을 보고, 추천 어필을 읽은 뒤, 악보와 필요 세션을 확인하고 자신의 참여 가능 여부를 최종 등록할 수 있도록 최적의 UX를 제공.
  2. **후보곡 목록 카드(`SetlistCard`)**:
     - 전체 가능/불가능 인원 집계는 표시하지 않으며, 현재 사용자가 해당 공연의 참가자인 경우에만 응답을 세션별(`베이스 가능`, `코러스 불가능`, `기타 미응답`)로 분리하여 표시. 공연 참가자가 아닌 관리자는 내 응답 영역을 표시하지 않음.
     - 악보 여부는 필요 세션 칩 행의 마지막에 표시하며 모바일에서는 `악보 O`/`악보 X`, `sm` 이상에서는 `악보 있음`/`악보 없음` 레이블을 사용. 모바일과 데스크톱 모두 동일하게 `곡 제목 - 아티스트 | 상세보기`, `필요 세션 | 나의 응답`, `어필 | 작성자`의 3행 구조로 구성.
  3. **상단 필터 툴바**:
     - 별도 [필터] 아이콘 버튼을 통해 확장/축소되는 3가지 필터 패널 제공:
       - **세션 필터**: `전체`, `보컬(남)`, `보컬(여)`, `건반` (기타, 베이스, 드럼 항목 제외)
       - **내 응답 필터**: `전체`, `가능`, `불가능`, `미선택`
       - **악보 필터**: `전체`, `악보 있음`, `악보 없음`
     - 필터 패널이 닫혀있을 때도 활성화된 필터 개수 뱃지 및 빠른 해제 칩을 노출하여 직관적으로 필터 상태 확인 및 초기화 가능.
     - 최신순/가나다순 정렬 토글 버튼을 제거하고, 항상 최초 등록순(과거 등록된 곡이 상단)으로 일관되게 정렬 표시.

---

## 3. 관련 파일 링크
- 선곡회의 목록 페이지: [app/gigs/[id]/nominations/page.tsx](file:///d:/dev/sokna/app/gigs/[id]/nominations/page.tsx)
- 후보곡 신규 등록 전용 페이지: [app/gigs/[id]/nominations/new/page.tsx](file:///d:/dev/sokna/app/gigs/[id]/nominations/new/page.tsx)
- 후보곡 정보 수정 전용 페이지: [app/gigs/[id]/nominations/[songId]/edit/page.tsx](file:///d:/dev/sokna/app/gigs/[id]/nominations/[songId]/edit/page.tsx)
- 후보곡 통합 폼 컴포넌트: [components/nominations/nomination-form.tsx](file:///d:/dev/sokna/components/nominations/nomination-form.tsx)
- 인라인 타임스탬프 빌더 컴포넌트: [components/nominations/timestamp-builder.tsx](file:///d:/dev/sokna/components/nominations/timestamp-builder.tsx)
- 리치 타임스탬프 텍스트에어리어: [components/nominations/rich-timestamp-textarea.tsx](file:///d:/dev/sokna/components/nominations/rich-timestamp-textarea.tsx)
- 링크 미리보기 및 시점 캡처 아이템: [components/nominations/link-preview-item.tsx](file:///d:/dev/sokna/components/nominations/link-preview-item.tsx)
- 선곡회의 서버 액션: [app/gigs/[id]/nominations/actions.ts](file:///d:/dev/sokna/app/gigs/[id]/nominations/actions.ts)
- 선곡회의 데이터 모델: [lib/nomination.ts](file:///d:/dev/sokna/lib/nomination.ts) (호환용: [lib/setlist.ts](file:///d:/dev/sokna/lib/setlist.ts))
- 선곡회의 메인 패널: [components/nominations/nomination-panel.tsx](file:///d:/dev/sokna/components/nominations/nomination-panel.tsx)
- 선곡회의 상세 드로어: [components/nominations/nomination-drawer.tsx](file:///d:/dev/sokna/components/nominations/nomination-drawer.tsx)
- 선곡회의 세션 응답 섹션: [components/nominations/nomination-response-section.tsx](file:///d:/dev/sokna/components/nominations/nomination-response-section.tsx)
- 선곡회의 외부 링크 배너 카드: [components/nominations/external-link-card.tsx](file:///d:/dev/sokna/components/nominations/external-link-card.tsx)
- 선곡회의 곡 가져오기 다이얼로그: [components/gigs/nomination-import-dialog.tsx](file:///d:/dev/sokna/components/gigs/nomination-import-dialog.tsx)
- DB 마이그레이션 파일: [supabase/migrations/20260917020000_create_nomination_responses.sql](file:///d:/dev/sokna/supabase/migrations/20260917020000_create_nomination_responses.sql)
- DB 세션별 응답 마이그레이션 파일: [supabase/migrations/20260918000000_update_nomination_responses_session_part.sql](file:///d:/dev/sokna/supabase/migrations/20260918000000_update_nomination_responses_session_part.sql)

