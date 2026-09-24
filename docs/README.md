# SOKNA (소리로 크는 나무) 프로젝트 명세 및 문서 가이드

본 디렉토리(`/docs`)는 **SOKNA 웹 애플리케이션의 유지보수, 시스템 아키텍처, 기존 기능 명세 및 향후 신규 기능 개발을 위한 표준 명세서**를 관리하는 공간입니다.

---

## 📌 문서 관리 원칙 (Documentation Rules)

1. **단일 진실 공급원 (Single Source of Truth)**
   - 프로젝트의 비즈니스 로직, 데이터 모델, 아키텍처 결정 사항은 항상 `/docs`의 문서를 기준으로 관리합니다.
2. **코드와 문서의 동기화 (Always in Sync)**
   - 기능 수정, 버그 패치, 리팩토링 시 변경된 로직은 즉시 해당 명세 문서에 반영합니다.
   - DB 스키마(테이블, 컬럼, RLS)가 변경되면 `docs/architecture/database-schema.md`를 즉각 갱신합니다.
3. **신규 개발 시 사전/동시 명세화 (Spec-Driven Development)**
   - 새로운 기능이나 화면 개발 시, `docs/templates/feature-spec-template.md`를 바탕으로 `docs/features/<기능명>.md`를 작성한 뒤 개발을 진행합니다.
4. **한글 문서화 표준**
   - 모든 기술 문서는 명확하고 직관적인 한국어로 작성하며, 기술 용어는 원문과 통용되는 번역어를 병기합니다.

---

## 📂 디렉토리 구조 (Document Structure)

```
docs/
├── README.md                      # 전체 문서 인덱스 및 문서 관리 규칙 (본 파일)
├── architecture/                  # 시스템 아키텍처 및 공통 설계
│   ├── system-overview.md         # 전체 기술 스택, 시스템 구조 및 디렉토리 개요
│   └── database-schema.md         # DB 테이블, ERD, RLS 및 관계 명세
├── pages/                         # 화면(페이지)별 디자인 & UX 상세 명세
│   ├── README.md                  # 사이트맵 및 사용자 화면 흐름도 (User Flow)
│   ├── 01-landing.md              # 메인 랜딩 페이지 (/) 명세
│   ├── 02-gigs.md                 # 공연 목록 페이지 (/gigs) 명세
│   ├── 03-gig-create.md           # 공연 등록 페이지 (/gigs/new) [관리자] 명세
│   ├── 04-setlists.md             # 선곡 회의 및 후보곡 (/gigs/[id]/nominations) 명세
│   ├── 05-auth.md                 # 인증 및 계정 (/auth/*) 명세
│   ├── 06-40th-anniversary.md     # 40주년 기념 공연 페이지 (/40th-anniversary) 명세
│   ├── 07-history.md              # 동아리 역사 소개 페이지 (/history) 명세
│   ├── 08-members.md              # 역대 부원 소개 페이지 (/members) 명세
│   ├── 09-photos.md               # 갤러리 사진첩 페이지 (/photos) 명세
│   ├── 10-gig-detail.md           # 공연 상세 정보 페이지 (/gigs/[id]) 명세
│   ├── 11-gig-join.md             # 공연 참가 신청 페이지 (/gigs/[id]/join) 명세
│   ├── 12-gig-edit.md             # 공연 수정 페이지 (/gigs/[id]/edit) [관리자] 명세
│   ├── 13-profile.md              # 회원 정보 수정 페이지 (/profile) 명세
│   └── 14-admin-members.md        # 관리자 회원 관리 페이지 (/admin/members) 명세
├── features/                      # 도메인별 기능 명세
│   ├── roles-and-permissions.md   # 역할별(방문자/회원/참여자/관리자) 기능 매트릭스 및 권한 가이드
│   ├── authentication.md          # 인증, 세션 관리 및 관리자 권한 명세
│   ├── gigs.md                    # 공연(Gigs) 및 참여자(Performers) 관리 명세
│   ├── setlists.md                # 셋리스트(곡) 등록, 파트 요구사항 및 악보 관리 명세
│   └── push-notifications.md      # Firebase FCM 푸시 알림 시스템 명세
├── maintenance/                   # 운영 및 유지보수 가이드
│   ├── environment-setup.md       # 로컬 개발 환경 및 환경 변수 설정 가이드
│   └── supabase-workflow.md       # Supabase CLI 및 DB 타입 자동 생성 워크플로우
└── templates/                     # 문서 템플릿
    └── feature-spec-template.md   # 신규 기능 명세 작성 표준 템플릿
```

---

## 📑 문서 바로가기

### 🖥️ 화면(페이지)별 디자인 & UX 명세
| 순번 | 페이지 / 도메인 | 라우트 | 주요 UX 및 인터랙션 |
| :---: | :--- | :--- | :--- |
| **00** | [Sitemap & User Flow](./pages/README.md) | 전체 | 전체 사이트맵 및 화면 이동 흐름도 |
| **01** | [메인 랜딩](./pages/01-landing.md) | `/` | 동아리 소개, 스크롤 패럴랙스, 콘서트 티켓형 예매 CTA |
| **02** | [공연 목록](./pages/02-gigs.md) | `/gigs` | 예정/지난 공연 그리드, D-Day 배지, 관리자 등록 버튼 |
| **03** | [공연 등록](./pages/03-gig-create.md) | `/gigs/new` | **관리자 전용**: 일정 입력, 참여자 검색/파트 배정 |
| **04** | [선곡 회의 / 셋리스트](./pages/04-setlists.md) | `/gigs/[id]/nominations` | 마감 카운트다운, 곡 등록 모달, 곡 상세 드로어, 악보/링크 |
| **05** | [인증 및 계정](./pages/05-auth.md) | `/auth/*` | 로그인, 회원가입(기수/파트), 비밀번호 재설정 |
| **06** | [40주년 기념 공연](./pages/06-40th-anniversary.md) | `/40th-anniversary` | D-Day 카운트다운, 타임테이블, 오시는 길, 사진 아카이브, 참석 설문(RSVP) |
| **07** | [동아리 역사](./pages/07-history.md) | `/history` | 1986년 창립부터 현재까지 연혁 타임라인 및 마일스톤 |
| **08** | [역대 부원](./pages/08-members.md) | `/members` | 기수별 역대 부원 명단, 관리자 부원 등록/수정/삭제 CRUD |
| **09** | [갤러리 사진첩](./pages/09-photos.md) | `/photos` | 공연/연습 사진 그리드, 라이트박스 뷰어, 관리자 사진 관리 CRUD |
| **10** | [공연 상세 정보](./pages/10-gig-detail.md) | `/gigs/[id]` | 공연 일정, D-Day, 세션 명단, 셋리스트 현황, 선곡 회의 CTA |
| **11** | [공연 참가 신청](./pages/11-gig-join.md) | `/gigs/[id]/join` | **로그인 회원 전용**: 비회원 차단, 선곡회의 일정 확인, 참가 여부(참여/불참/미정) 제출, 이탈 방지 팝업 |
| **12** | [공연 수정](./pages/12-gig-edit.md) | `/gigs/[id]/edit` | **관리자 전용**: 공연 기본 정보, 일정, 포스터, 공개 여부 및 세션원 명단 수정, 이탈 방지 팝업 |
| **13** | [회원 정보 수정](./pages/13-profile.md) | `/profile` | **로그인 회원 전용**: 이름, 기수, 담당 세션 파트, 행사 소식 수신 동의 수정, 이탈 방지 팝업 |
| **14** | [관리자 회원 관리](./pages/14-admin-members.md) | `/admin/members` | **관리자 전용**: 가입 대기 회원 승인/반려, 부원 정보 수정, 관리자 권한 관리, 이탈 방지 팝업 |


### ⚙️ 시스템 및 도메인 기능 명세
| 분류 | 문서명 | 주요 내용 |
| :--- | :--- | :--- |
| **Feature** | [roles-and-permissions.md](./features/roles-and-permissions.md) | **방문자 / 일반 회원 / 세션 참여자 / 관리자별 기능 매트릭스** |
| **Feature** | [authentication.md](./features/authentication.md) | Supabase Auth, 쿠키 기반 세션 갱신, 관리자 권한 판별 |
| **Feature** | [gigs.md](./features/gigs.md) | 공연 생성, 목록/상세 조회, 참여 세션(Performer) 매핑 |
| **Feature** | [setlists.md](./features/setlists.md) | 곡 등록/삭제, 필수 파트 선택, 악보 유무, 참고 링크 관리 |
| **Feature** | [push-notifications.md](./features/push-notifications.md) | Firebase Cloud Messaging(FCM) 토큰 관리 및 푸시 수신 |
| **Feature** | [setlist-notifications-and-highlights.md](./features/setlist-notifications-and-highlights.md) | **선곡회의 곡 수정 하이라이팅 및 새 곡 15분 지연 알림 큐** |
| **Feature** | [spreadsheet-bulk-import.md](./features/spreadsheet-bulk-import.md) | **엑셀 공연자 및 셋리스트 표 일괄 불러오기(덮어쓰기) 및 스마트 Conflict 해결** |
| **Architecture** | [system-overview.md](./architecture/system-overview.md) | Next.js 16, Supabase SSR, Tailwind CSS 등 시스템 전체 구조 |
| **Architecture** | [database-schema.md](./architecture/database-schema.md) | Supabase DB 스키마, 테이블 상세, ERD, 제약조건 |
| **Maintenance** | [environment-setup.md](./maintenance/environment-setup.md) | `.env.local` 환경 변수 설정 및 로컬 서버 구동 |
| **Maintenance** | [supabase-workflow.md](./maintenance/supabase-workflow.md) | DB 변경 사항 반영, `npm run types` 스크립트 활용법 |
| **Maintenance** | [push-notification-test-20260922.md](./maintenance/push-notification-test-20260922.md) | 2026-09-22 웹 푸시 즉시 알림 통합 테스트 증적 및 남은 검증 |
| **Template** | [feature-spec-template.md](./templates/feature-spec-template.md) | 신규 기능 개발을 위한 표준 명세 작성 양식 |

