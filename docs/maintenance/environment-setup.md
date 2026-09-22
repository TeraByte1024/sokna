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
SUPABASE_SECRET_KEY=<your-sb-secret-key>
NEXT_PUBLIC_APP_URL=https://<your-production-domain>

# Firebase 푸시 알림 설정 (선택/푸시 기능 활성화 시 필요)
NEXT_PUBLIC_FIREBASE_API_KEY=<your-firebase-api-key>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<your-firebase-auth-domain>
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<your-firebase-project-id>
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=<your-firebase-storage-bucket>
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=<your-firebase-sender-id>
NEXT_PUBLIC_FIREBASE_APP_ID=<your-firebase-app-id>
NEXT_PUBLIC_FIREBASE_VAPID_KEY=<your-firebase-vapid-key>
FIREBASE_CLIENT_EMAIL=<firebase-admin-service-account-email>
FIREBASE_PRIVATE_KEY="<firebase-admin-private-key-with-\\n>"

# Vercel Cron 인증
CRON_SECRET=<long-random-secret>
```

> [!WARNING]
> `SUPABASE_SECRET_KEY`는 서버 환경에서만 접근 가능한 최고 권한 키입니다. 절대 클라이언트 코드에 노출하거나 공개 저장소에 커밋하지 마십시오. 기존 프로젝트는 `SUPABASE_SERVICE_ROLE_KEY`도 하위 호환됩니다.

### 2.1 Firebase Console 설정

1. Firebase 프로젝트 설정에서 웹 앱을 등록하고 `NEXT_PUBLIC_FIREBASE_*` 값을 복사합니다.
2. Cloud Messaging의 Web Push 인증서에서 VAPID 키 쌍을 생성하고 공개 키를 `NEXT_PUBLIC_FIREBASE_VAPID_KEY`로 설정합니다.
3. 프로젝트 설정의 서비스 계정에서 새 비공개 키를 생성합니다.
4. JSON의 `client_email`을 `FIREBASE_CLIENT_EMAIL`, `private_key`를 `FIREBASE_PRIVATE_KEY`로 설정합니다. 배포 환경에서는 줄바꿈을 `\\n`으로 보존합니다.
5. Firebase 서비스 계정 JSON 파일 자체는 저장소에 넣지 않습니다.

### 2.2 Supabase 및 배포 설정

1. Supabase Dashboard의 서버 전용 secret key를 `SUPABASE_SECRET_KEY`로 설정합니다.
2. Google OAuth를 로컬에서 사용할 경우 Supabase Dashboard의 **Authentication > URL Configuration > Redirect URLs**에 `http://localhost:3000/auth/callback`을 추가합니다. 운영 **Site URL**은 운영 도메인으로 유지합니다. 이 로컬 콜백이 허용되지 않으면 Supabase가 로그인 후 운영 Site URL로 되돌릴 수 있습니다.
3. `npx supabase db push`로 최신 마이그레이션을 적용합니다.
4. `npm run types`로 원격 스키마 타입을 다시 생성합니다.
5. Vercel 환경 변수에도 동일한 서버/공개 변수를 등록하고 16자 이상의 임의 문자열 `CRON_SECRET`을 추가합니다.
6. **Vercel Pro/Enterprise**라면 `vercel.json`에 아래 스케줄을 추가합니다. Vercel Hobby는 1일 1회만 허용하므로 이 설정으로 배포할 수 없습니다.

   ```json
   {
     "crons": [{ "path": "/api/cron/notifications", "schedule": "* * * * *" }]
   }
   ```

7. **Vercel Hobby**라면 Supabase Dashboard의 Cron 기능 등 외부 스케줄러에서 매분 다음 요청을 호출합니다.

   ```text
   GET https://<your-production-domain>/api/cron/notifications
   Authorization: Bearer <CRON_SECRET>
   ```

8. 배포 후 cron 응답이 401/500 없이 완료되고 `nominationQueues`, `pendingPush` 카운트가 반환되는지 실행 로그에서 확인합니다.

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
