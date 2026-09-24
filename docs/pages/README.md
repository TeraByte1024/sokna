# 페이지별 기능 및 UX 흐름 가이드 (Page & Domain Specs)

본 문서는 SOKNA 웹 애플리케이션의 모든 화면을 **페이지(Domain) 단위로 구조화**하여, 실제 구현된 **디자인 레이아웃, 컴포넌트 계층, 사용자 인터랙션 및 UX 흐름**을 한눈에 추적할 수 있도록 정리한 명세입니다.

---

## 🗺️ 사이트맵 및 사용자 화면 흐름 (Sitemap & User Flow)

```mermaid
flowchart TD
    Home["01. 메인 랜딩 (/)"] -->|네비게이션| Gigs["02. 공연 목록 (/gigs)"]
    Home -->|네비게이션| History["07. 동아리 역사 (/history)"]
    Home -->|네비게이션| Members["08. 역대 부원 (/members)"]
    Home -->|네비게이션| Photos["09. 사진 갤러리 (/photos)"]
    Home -->|골드 하이라이트| Anniv["06. 40주년 기념 공연 (/40th-anniversary)"]
    Home -->|Sign in / Sign up| Auth["05. 인증 센터 (/auth/*)"]
    
    subgraph Gigs Domain
        Gigs -->|공연 카드 클릭| GigDetail["10. 공연 상세 (/gigs/[id])"]
        GigDetail -->|선곡 회의 바로가기 (회원)| Setlists["04. 선곡 회의 및 셋리스트 (/gigs/[id]/nominations)"]
        Gigs -->|선곡 회의 미니버튼 (회원)| Setlists
        Gigs -->|관리자: '공연 등록' 클릭| GigCreate["03. 공연 등록 (/gigs/new)"]
    end
    
    subgraph Setlist Interactions
        Setlists -->|곡 추천하기 버튼| NewPage["후보곡 등록 페이지 (NominationForm)"]
        Setlists -->|곡 카드 클릭| Drawer["곡 상세 드로어 (NominationDrawer)"]
    end
```

---

## 📂 페이지별 명세 문서 목록

| 순번 | 페이지 / 도메인 | URL 경로 | 대상 사용자 | 핵심 기능 및 UX |
| :---: | :--- | :--- | :---: | :--- |
| **01** | [메인 랜딩](./01-landing.md) | `/` | 전체 (방문자/회원) | 동아리 비주얼 브랜딩, 패럴랙스 섹션, 티켓 스타일 예매 CTA |
| **02** | [공연 목록](./02-gigs.md) | `/gigs` | 전체 (방문자/회원/관리자) | 예정/지난 공연 그리드, D-Day 배지, 관리자 전용 등록 CTA |
| **03** | [공연 등록](./03-gig-create.md) | `/gigs/new` | **관리자 전용** | 공연 일정 입력, 회원 검색 및 세션(Performer) 파트 일괄 배정 |
| **04** | [선곡 회의/셋리스트](./04-setlists.md) | `/gigs/[id]/nominations` | **세션 참여자/회원/관리자** | 마감 타이머, 곡 카드 리스트, 곡 제안 모달, 곡 상세 드로어, 악보/링크 |
| **05** | [인증 및 계정](./05-auth.md) | `/auth/*` | 방문자 및 회원 | 회원가입(이름/기수/파트), 로그인, 세션 쿠키 발급, 비밀번호 재설정 |
| **06** | [40주년 기념 공연](./06-40th-anniversary.md) | `/40th-anniversary` | 전체 (동문 OB / 재학생 YB) | D-Day 카운트다운 타이머, 타임테이블, 오시는 길, 사진 아카이브, 참석 설문(RSVP) |
| **07** | [동아리 역사](./07-history.md) | `/history` | 전체 (방문자/회원) | 1986년 창립부터 현재까지 연혁 타임라인 및 마일스톤 |
| **08** | [역대 부원](./08-members.md) | `/members` | 전체 / 관리자 | 기수별 부원 명단 아코디언, 관리자 부원 추가/수정/삭제 CRUD |
| **09** | [갤러리 사진첩](./09-photos.md) | `/photos` | 전체 / 관리자 | 공연/합주 사진 그리드, 라이트박스 확대 뷰어, 관리자 사진 관리 CRUD |
| **10** | [공연 상세 정보](./10-gig-detail.md) | `/gigs/[id]` | 전체 (방문자/회원) | 공연 일정, D-Day 상태, 파트별 참여 세션원 명단, 셋리스트 현황, 선곡 회의 CTA, 관리자 참가신청 링크 복사 및 RSVP 현황 |
| **11** | [공연 참가 신청](./11-gig-join.md) | `/gigs/[id]/join` | **로그인 회원 전용** | 비회원 원천 차단, 공연 및 선곡회의 일정 확인, 참가 여부(참여/불참/미정) 및 희망 세션 파트 제출, 이탈 방지 팝업 |
| **12** | [공연 정보 수정](./12-gig-edit.md) | `/gigs/[id]/edit` | **관리자 전용** | 공연 기본 정보/일정/장소/포스터/셋리스트/공연자 수정, 미연동 공연자 수동 매핑, 이탈 방지 팝업 |
| **13** | [회원 정보 수정](./13-profile.md) | `/profile` | **로그인 회원 전용** | 이름, 기수, 담당 세션 파트, 행사 소식 수신 동의 수정, 이탈 방지 팝업 |
| **14** | [관리자 회원 관리](./14-admin-members.md) | `/admin/members` | **관리자 전용** | 가입 대기 회원 승인/반려, 부원 정보(이름/기수/파트) 수정, 관리자 권한 관리, 이탈 방지 팝업 |

---

## 💡 페이지 명세 작성 표준 원칙
각 페이지 문서는 다음 항목을 필수로 포함합니다:
1. **페이지 기본 정보**: 라우트 경로, 접근 권한, 레이아웃
2. **실제 디자인 레이아웃 (Wireframe & Components)**: 화면 구획 및 스타일링
3. **UX 흐름 및 사용자 인터랙션**: 버튼 클릭, 모달 오픈, 데이터 제출 단계
4. **화면 상태 (UI States)**: Loading, Empty, Normal, Expired/Disabled, Error
5. **백엔드 데이터 흐름**: Supabase 쿼리, Server Action, 캐시 무효화(`revalidatePath`)
6. **관련 컴포넌트 및 소스코드 링크**
