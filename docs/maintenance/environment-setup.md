# 개발 환경 및 환경 변수 설정 가이드 (Environment Setup)

## 1. 사전 요구사항 (Prerequisites)
- **Node.js**: v18.18.0 이상 (v20 권장)
- **npm** 또는 **pnpm**
- **Supabase CLI** (로컬 개발 및 타입 생성용)

---

## 2. 환경 변수 설정 (`.env.local`)

프로젝트 루트의 `.env.local` 파일에 다음 환경 변수를 설정해야 합니다:

```bash
# Supabase API 설정
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your-anon-or-publishable-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-secret-key>

# Firebase 푸시 알림 설정 (선택/푸시 기능 활성화 시 필요)
NEXT_PUBLIC_FIREBASE_API_KEY=<your-firebase-api-key>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<your-firebase-auth-domain>
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<your-firebase-project-id>
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=<your-firebase-storage-bucket>
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=<your-firebase-sender-id>
NEXT_PUBLIC_FIREBASE_APP_ID=<your-firebase-app-id>
NEXT_PUBLIC_FIREBASE_VAPID_KEY=<your-firebase-vapid-key>
```

> [!WARNING]
> `SUPABASE_SERVICE_ROLE_KEY`는 서버 환경에서만 접근 가능한 최고 권한 키입니다. 절대 클라이언트 코드에 노출하거나 공개 저장소에 커밋하지 마십시오.

---

## 3. 프로젝트 설치 및 실행 스크립트

```bash
# 1. 의존성 패키지 설치
npm install

# 2. 로컬 개발 서버 구동 (기본 포트: 3000)
npm run dev

# 3. 프로덕션 빌드 및 테스트
npm run build
npm run start

# 4. 린트 검사
npm run lint

# 5. Supabase TypeScript 타입 생성 (원격 프로젝트 연동 시)
npm run types
```
