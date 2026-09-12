# 셋리스트 및 선곡 관리 명세 (Setlists)

## 1. 기능 개요
특정 공연(`gig_id`)에 참여하는 멤버들이 연주할 후보곡을 등록하고, 곡별 필요 세션(보컬, 기타, 베이스, 드럼, 건반 등), 악보 보유 여부, 참고 링크(유튜브, 음원 등), 상세 설명을 공유하고 협업하는 기능입니다.

---

## 2. 세부 명세

### 2.1 셋리스트 목록 및 상세 패널 (`/gigs/[id]/setlists`)
- **조회 조건**:
  - `gigs.id == [id]`에 해당하는 모든 셋리스트 조회.
  - 곡 등록자(`created_by` -> `performers` -> `users`) 정보를 조인하여 기수, 파트, 작성자 이름 표시.
- **주요 UI 요소**:
  - `SetlistPanel`: 곡 목록을 카드 리스트 형태로 렌더링.
  - `PartChip`: 필요 악기 세션 파트 뱃지 표시.
  - `SetlistDrawer`: 모바일/데스크톱 대응 곡 상세 드로어 및 유튜브 링크 미리보기.

### 2.2 곡 등록 (`SetlistNewModal` & `addSetlist`)
- **등록 자격 (보안 검사)**:
  - 로그인된 유저가 해당 공연(`gig_id`)의 `performers` 테이블에 등록되어 있어야 함 (`user_id` & `gig_id`).
  - 참여자가 아닐 경우 `"이 공연의 참여자로 등록되지 않았습니다."` 에러 반환.
- **입력 데이터 구조**:
  ```ts
  export interface SetlistFormValues {
    title: string;          // 곡 제목
    artist: string;         // 아티스트명
    requiredParts: string[]; // 필요 세션 배열 (예: ['보컬', '기타', '드럼'])
    sheetExists: boolean;   // 악보 보유 여부
    description: string;    // 메모 및 특이사항
    links: {                // 참고 URL 목록 (jsonb)
      url: string;
      note?: string;
    }[];
  }
  ```
- **데이터베이스 반영**:
  - `setlists` 테이블에 insert.
  - `created_by` 컬럼에는 유저의 `performers.id`가 저장됨.
  - 등록 완료 후 `revalidatePath('/gigs/${gigId}/setlists')`로 갱신.

### 2.3 곡 삭제 (`deleteSetlist`)
- **권한**:
  - 본인이 등록한 곡이거나 관리자일 경우 삭제 가능.
  - Server Action `deleteSetlist(gigId, id)` 호출.

---

## 3. 관련 파일 링크
- 셋리스트 페이지: [app/gigs/[id]/setlists/page.tsx](file:///c:/dev/sokna/app/gigs/[id]/setlists/page.tsx)
- 셋리스트 서버 액션: [app/gigs/[id]/setlists/actions.ts](file:///c:/dev/sokna/app/gigs/[id]/setlists/actions.ts)
- 셋리스트 데이터 모델: [lib/setlist.ts](file:///c:/dev/sokna/lib/setlist.ts)
- 셋리스트 메인 패널: [components/setlists/setlist-panel.tsx](file:///c:/dev/sokna/components/setlists/setlist-panel.tsx)
- 셋리스트 등록 모달: [components/setlists/setlist-new-modal.tsx](file:///c:/dev/sokna/components/setlists/setlist-new-modal.tsx)
- 셋리스트 상세 드로어: [components/setlists/setlist-drawer.tsx](file:///c:/dev/sokna/components/setlists/setlist-drawer.tsx)
