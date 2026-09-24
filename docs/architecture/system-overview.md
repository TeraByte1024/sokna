# 시스템 아키텍처 개요 (System Overview)

## 1. 시스템 목적
SOKNA(소리로 크는 나무)는 한양대학교·한양여자대학교 음악 밴드 동아리를 위한 통합 웹 플랫폼입니다.  
공연(Gig) 일정 관리, 공연 참여자(Performer) 매핑, 곡(Setlist) 신청 및 필수 파트 관리, 푸시 알림 등의 핵심 운영 업무를 자동화하고 동아리 회원 간의 원활한 협업을 지원합니다.

---

## 2. 기술 스택 (Tech Stack)

| 영역 | 기술 | 버전 / 비고 |
| :--- | :--- | :--- |
| **Framework** | Next.js (App Router) | v16.x (React 19) |
| **Language** | TypeScript | v5.x |
| **Styling** | Tailwind CSS | v3.4.x, Lucide React Icons |
| **UI Components** | Radix UI Primitives | shadcn/ui 디자인 시스템 기반 |
| **Animation** | Framer Motion | v12.x |
| **Backend & DB** | Supabase (PostgreSQL) | Managed Cloud Database |
| **Auth & Session** | Supabase Auth (`@supabase/ssr`) | HttpOnly Cookie 기반 세션 유지 |
| **Push Notification**| Firebase Cloud Messaging (FCM) | v12.x (Web Push) |

---

## 3. 디렉토리 구조 (Directory Structure)

```
c:\dev\sokna\
├── app/                           # Next.js App Router (페이지 및 서버 액션)
│   ├── auth/                      # 로그인, 회원가입, 비밀번호 재설정 라우트
│   │   ├── login/
│   │   ├── sign-up/
│   │   ├── forgot-password/
│   │   └── update-password/
│   ├── gigs/                      # 공연 관련 라우트
│   │   ├── [id]/                  # 공연 상세
│   │   │   └── setlists/          # 공연별 셋리스트 라우트
│   │   ├── new/                   # 공연 등록 (관리자)
│   │   ├── actions.ts             # 공연 생성/관리 Server Actions
│   │   └── page.tsx               # 공연 목록 페이지
│   ├── protected/                 # 보호된 인증 전용 라우트
│   ├── globals.css                # 글로벌 CSS 및 Tailwind 설정
│   └── layout.tsx                 # 루트 레이아웃 (Theme, Fonts, Header, Footer)
├── components/                    # 재사용 가능한 UI 컴포넌트
│   ├── ui/                        # Radix UI 기반 atomic 컴포넌트 (button, dialog, input 등)
│   ├── gigs/                      # 공연 관련 전용 컴포넌트
│   ├── nominations/              # 선곡회의 후보곡 관련 전용 컴포넌트
│   ├── site-header.tsx            # 공통 상단 네비게이션 헤더
│   ├── site-footer.tsx            # 공통 푸터
│   └── landing.tsx                # 랜딩 페이지 섹션 컴포넌트
├── lib/                           # 핵심 비즈니스 로직 및 외부 연동 클라이언트
│   ├── supabase/                  # Supabase 클라이언트 및 타입 정의
│   │   ├── client.ts              # 브라우저용 Supabase 클라이언트 (createBrowserClient)
│   │   ├── server.ts              # 서버용 Supabase 클라이언트 (createServerClient with cookies)
│   │   ├── admin.ts               # 관리자용 상수/설정
│   │   ├── proxy.ts               # 세션 쿠키 갱신 헬퍼
│   │   └── database.types.ts      # 자동 생성된 DB 스키마 TypeScript 타입
│   ├── firebase/                  # Firebase FCM 푸시 알림 설정
│   │   ├── firebase.ts            # Firebase 앱 및 Messaging 초기화
│   │   └── pushNotification.ts    # 토큰 요청 및 메시지 이벤트 핸들러
│   ├── auth-admin.ts              # 관리자 권한 확인 (React cache 적용)
│   ├── gig.ts                     # 공연 데이터 모델 및 포맷팅 유틸
│   ├── setlist.ts                 # 셋리스트 데이터 모델 및 파싱 유틸
│   └── utils.ts                   # Tailwind 클래스 병합(cn) 등 공통 유틸
├── docs/                          # 프로젝트 아키텍처, 명세 및 운영 문서
└── proxy.ts                       # Next.js Request Session Proxy (미들웨어)
```

---

## 4. 핵심 데이터 흐름 (Core Architecture Flow)

### 4.1 인증 및 세션 수명주기 (Auth & Session Lifecycle)
- **요청 가로채기 (`proxy.ts`)**: 모든 페이지 및 API 라우트 요청 시 `proxy.ts`에서 `@supabase/ssr`의 `updateSession`을 호출하여 유효한 세션 쿠키를 갱신합니다.
- **Server Components & Server Actions**: 서버 사이드에서는 `lib/supabase/server.ts`의 `createClient()`를 호출해 쿠키 저장소를 참조하는 안전한 클라이언트를 생성합니다.
- **관리자 권한 인가 (`lib/auth-admin.ts`)**: `getIsAdmin()`을 통해 현재 인증된 유저의 이메일이 `admins` 테이블에 존재하는지 확인합니다. React `cache`를 적용하여 단일 HTTP 요청 주기 내에서 중복 DB 쿼리를 방지합니다.
- **공연 조회 (`lib/gig-server-data.ts`)**: 공연 상세·수정 페이지의 메타데이터와 본문에서 동일 공연 기본 정보 조회를 요청 단위로 재사용합니다. 비공개 공연의 접근 판정은 각 페이지에서 계속 수행합니다.
- **이미지 (`components/ui/responsive-image.tsx`)**: 프로젝트의 Supabase 공개 Storage URL은 Next 이미지 최적화를 사용합니다. 외부 URL은 직접 표시하며, 목록 첫 이미지 우선 로드와 나머지 이미지 지연 로드를 구분합니다.

### 4.2 데이터 변경 및 캐싱 전략 (Mutations & Caching)
- 데이터 변경은 Next.js **Server Actions**(`app/gigs/actions.ts`, `app/gigs/[id]/nominations/actions.ts`)를 통해 수행됩니다.
- 변경 완료 후 `revalidatePath('/path')`를 호출하여 Next.js 서버 캐시를 무효화하고 최신 데이터를 클라이언트에 전달합니다.
