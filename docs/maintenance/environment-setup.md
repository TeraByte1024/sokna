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

`.env.local`은 `.gitignore` 대상이며 로컬 실행에서만 읽습니다. Git으로 Vercel에 배포할 때 파일과 값이 자동 전달되지 않으므로 **Vercel 프로젝트 → Settings → Environment Variables**에 같은 이름의 필요한 변수를 별도로 등록해야 합니다. 운영은 **Production** 범위를 선택하고 저장 후 **Redeploy**합니다. `SUPABASE_SECRET_KEY`에는 서버 전용 secret key를 사용하고 `NEXT_PUBLIC_` 접두사를 붙이지 않습니다. 로컬 파일을 커밋하여 전달하지 않습니다.

### 2.1 Firebase Console 설정

1. Firebase 프로젝트 설정에서 웹 앱을 등록하고 `NEXT_PUBLIC_FIREBASE_*` 값을 복사합니다.
2. Cloud Messaging의 Web Push 인증서에서 VAPID 키 쌍을 생성하고 공개 키를 `NEXT_PUBLIC_FIREBASE_VAPID_KEY`로 설정합니다.
3. 프로젝트 설정의 서비스 계정에서 새 비공개 키를 생성합니다.
4. JSON의 `client_email`을 `FIREBASE_CLIENT_EMAIL`, `private_key`를 `FIREBASE_PRIVATE_KEY`로 설정합니다. 배포 환경에서는 줄바꿈을 `\\n`으로 보존합니다.
5. Firebase 서비스 계정 JSON 파일 자체는 저장소에 넣지 않습니다.

### 2.2 Supabase 및 배포 설정

1. Supabase Dashboard의 서버 전용 secret key를 `SUPABASE_SECRET_KEY`로 설정합니다.
2. Google OAuth를 로컬에서 사용할 경우 Supabase Dashboard의 **Authentication > URL Configuration > Redirect URLs**에 `http://localhost:3000/auth/callback`을 추가합니다. 운영 **Site URL**은 운영 도메인으로 유지합니다. 이 로컬 콜백이 허용되지 않으면 Supabase가 로그인 후 운영 Site URL로 되돌릴 수 있습니다.
3. `npx supabase db push`로 최신 마이그레이션을 적용합니다. 알림 outbox 전환은 아래 2.3의 동시 전환 절차를 먼저 따릅니다.
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

8. 배포 후 cron 응답이 401/500 없이 완료되고 `pendingPush.processedCount`와 `pendingPush.sentCount`가 반환되는지 실행 로그에서 확인합니다.

### 2.3 알림 outbox 구조 전환

`20260927000000_simplify_notification_outbox.sql`은 **2026-09-27 공유 운영 DB에 적용 완료**했습니다. 이번에는 구 서버·cron 중지 여부가 미확인인 상태에서 사용자가 DB 선행 변경을 명시적으로 지시했습니다. 새 서버의 운영 배포와 cron 정상 동작은 아직 확인하지 않았습니다. 다른 환경에서는 아래 동시 전환 절차를 따릅니다.

1. 새 서버 코드·마이그레이션·환경 변수와 [알림 outbox 명세](../features/notification-outbox.md)를 함께 검토하고 배포 전 검증 후 전환 구간을 정합니다.
2. 기존 서버의 가입·승인·후보곡 쓰기와 기존 cron을 중지하고 진행 중인 작업을 마칩니다. 기존 코드가 새 스키마와 함께 실행되지 않도록 합니다.
3. 마이그레이션으로 기존 `gig_notification_queue`의 미처리 항목을 계정 outbox에 이관한 뒤 테이블을 제거합니다. 기존 성공 기기 체크포인트·읽음·종결 기록은 보존하고 `sent`는 `accepted`로, `processing`은 선점 시각이 있는 pending으로 옮기며 `push_eligible`은 제거합니다.
4. 새 서버 코드를 함께 전환합니다. 공통 DB 헬퍼 `create_app_notification()`의 직접 RPC 실행 권한은 열지 않습니다. 새 생성 경로는 회원·후보곡 트리거와 관리자 검증이 있는 승인 RPC입니다.
5. 새 스키마 기준으로 `npm run types`를 실행하고 해당 타입과 새 코드를 사용합니다. 연결된 원격 DB에서 타입을 생성하는 명령은 DB 마이그레이션을 대신하지 않습니다.
6. 알림 생성과 계정별 중복 방지, 미동의자의 인앱 내역 및 푸시 제외, 기존 미확인 개수 조회를 확인합니다. cron 응답 `pendingPush`와 pending/accepted/skipped/failed 상태를 확인하고 주기 호출을 재개합니다.

이번 적용에는 누락된 `20260925000000_track_marketing_consent_time.sql`, 비공개 복구 사본을 만드는 `20260926235959_backup_notification_outbox.sql`, outbox 마이그레이션을 순서대로 적용했습니다. 로컬보다 이후 버전이 이미 적용된 이력이 있어 CLI의 `--include-all`로 정확한 미적용 목록을 확인한 후 진행했습니다.

복구 사본은 `sokna_migration_backup_20260927`에 있으며 기존 알림·큐와 교체 함수 정의·스키마 메타데이터를 포함합니다. 같은 DB의 제한된 사본이며 독립 백업은 아닙니다. 복구가 필요하면 서버 쓰기를 중지하고 전환 후 새로 생성된 데이터까지 대조하여 복원해야 하며, 구 테이블로 단순 덮어쓰지 않습니다. 서버 배포와 데이터 보존 검증 후 제거 여부를 결정합니다. 마이그레이션 자체는 트랜잭션으로 수행하고, 임의 UUID 알림 매핑 모호성·잠금 대기 5초·실행 60초 초과 시 중단합니다.

적용 직후 기존 알림 42건 보존, 큐 2건에서 4개 수신 알림 이관(총 46건), 완료 알림 상태 보존, 수신자 누락 0건, REST 스키마 조회 HTTP 200을 확인했습니다. `npm run types`로 타입을 재생성했습니다. 실제 운영 FCM 전송은 실행하지 않았습니다.

새 cron은 `notifications`만 처리하며 응답은 `{ ok, pendingPush: { processedCount, sentCount }, timestamp }`입니다. 1분 간격 재실행은 일시 실패와 5분 선점 만료를 복구하며 FCM 접수 성공은 실기기 배너나 사용자 열람 확인과 다릅니다.

---

### 2.3.1 동의 철회 원자성과 기기 서비스 전환

`20260927020000_unify_push_consent.sql`은 기존 동의 시각 트리거를 유지하면서 true → false 철회의 기기 삭제를 같은 DB 트랜잭션에 추가합니다. 새 서버는 별도 전체 기기 DELETE를 제거하므로 **DB 마이그레이션을 먼저 적용하고 새 서버를 배포**합니다. 구 서버가 이후 중복 DELETE를 실행해도 이미 삭제된 행에는 영향이 없습니다.

격리 DB에서 timestamp 보존·동의 철회·부분 실패 롤백·RLS를 검증한 뒤 적용합니다. 기존 사용자의 동의나 날짜를 일괄 변경하지 않습니다. 앱 코드만 되돌리면 기존 서버의 삭제는 계속 동작하며, DB 트리거 제거가 필요한 경우 구 코드의 삭제 경로가 복원된 뒤 진행합니다.

2026-09-27 공유 운영 DB에 적용 완료했습니다. 원격 마이그레이션 이력과 적용 전후 회원 12건·기기 5건·알림 35건 보존을 확인했고 `npm run types`를 실행했습니다. 새 애플리케이션 코드의 운영 배포는 별도입니다. [통합 검증 결과](../features/push-notifications.md#동의기기-수명주기-통합-검증-2026-09-27)를 참고합니다.

### 2.4 운영 기기 등록 오류 점검

`이 기기의 알림 등록을 확인하지 못했습니다. 다시 시도해 주세요.`는 기기 설정 서버 액션의 공통 실패 응답입니다. 키 등록 유무나 DB 조회 HTTP 200만으로 증명 쿠키 저장까지 성공했다고 판단하지 않습니다.

1. 실패한 사이트 주소·발생 시각·동작(메뉴 열기/토글 켜기/끄기)을 확인하고, 해당 배포의 서버 실행 로그에서 `[push-device] operation failed`를 검색합니다. 이 진단 코드가 포함된 배포에서부터 단계별 로그를 확인할 수 있습니다.
2. 로그의 `action`과 `stage`로 실패 경로를 좁힙니다. `code`/`status`는 제공자가 반환한 값 중 허용된 항목만 남기며, 없는 경우 단계부터 확인합니다.

| `stage` | 확인 사항 |
| :--- | :--- |
| `session` | 현재 사용자 인증 검증 및 Auth 서버·네트워크 상태 |
| `consent-read`, `consent-write` | 본인 `users.marketing_opt_in` 조회·저장과 접근 권한 |
| `own-profile-read` | 로그인 계정의 기존 `profiles` 조회와 RLS |
| `receipt-read`, `receipt-write`, `receipt-clear` | 요청 쿠키 접근 및 서버 액션의 쿠키 저장·삭제 경로 |
| `receipt-sign` | 해당 실행 환경의 서버 전용 Supabase 키 설정과 서명 처리 |
| `receipt-profile-read`, `profile-bind`, `profile-refresh`, `profile-delete` | 서버 전용 키의 실제 API 접근, 기기 행 상태, 조건부 갱신 경합 |
| `profile-insert` | 기기 저장 제약과 접근 권한. `23505`는 기존 토큰 충돌이며 다른 계정의 행을 임의로 덮어쓰지 않음 |

3. `SUPABASE_SECRET_KEY` 또는 호환 이름 `SUPABASE_SERVICE_ROLE_KEY`가 **현재 배포의 실행 환경**에 적용되는지 확인합니다. Vercel의 Production/Preview 범위와 변경 후 배포 반영 여부를 구분합니다. 환경 변수 변경은 새 배포부터 적용됩니다([Vercel 공식 안내](https://vercel.com/docs/environment-variables/managing-environment-variables)). 두 변수가 모두 있으면 `SUPABASE_SECRET_KEY`가 우선하므로 빈 값도 확인합니다. 키 값은 로그·이슈·채팅에 복사하지 않습니다.
4. 수정 후 같은 기기에서 상태 확인과 토글 설정을 다시 수행합니다. 상태 조회가 성공한 것과 실제 푸시 수신 성공은 별도로 검증합니다. 진단 중 기존 기기 행·브라우저 토큰을 일괄 삭제하지 않습니다.

2026-09-27 점검에서 연결된 DB의 `profiles` 컬럼·고유 인덱스·RLS와 로컬 서버 키를 사용한 읽기(HTTP 200)를 확인했습니다. 조회한 최근 Node 앱 요청에도 기기 조회·저장의 DB 오류는 없었습니다. 운영 브라우저 직접 재현과 운영 서버 예외 로그는 확인하지 못했으므로 운영 장애 원인은 아직 미확정이며, 이 점검은 복구 완료를 의미하지 않습니다.

---

### 2.5 운영 푸시 발송 오류 점검

기기 토큰 등록에는 Supabase 서버 키가 필요하고, 실제 전송에는 별도의 Firebase Admin 자격 증명이 필요합니다. `.env.local`에만 저장했다면 아래 값도 **Vercel → Settings → Environment Variables → Production**에 등록하고 재배포합니다.

| 환경 변수 | Firebase 서비스 계정 JSON의 값 |
| :--- | :--- |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | 같은 Firebase 프로젝트의 `project_id` |
| `FIREBASE_CLIENT_EMAIL` | `client_email` |
| `FIREBASE_PRIVATE_KEY` | `private_key` 전체 PEM 문자열 |

Firebase Console의 프로젝트 설정 → 서비스 계정에서 확인한 자격 증명을 사용합니다([Firebase Admin 공식 안내](https://firebase.google.com/docs/admin/setup)). `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` 이름에는 `NEXT_PUBLIC_`을 붙이지 않습니다. Vercel 입력란에 키 문자열을 넣을 때 `.env`의 바깥 따옴표나 `FIREBASE_PRIVATE_KEY=` 부분을 포함하지 않습니다. 실제 줄바꿈 또는 리터럴 `\n` 형태를 지원하며, 코드가 리터럴 `\n`을 실제 줄바꿈으로 바꿉니다. 값이나 JSON 파일을 로그·채팅·저장소에 공개하지 않습니다.

- `retryable_delivery_failure`는 재시도 대상으로 분류된 발송 실패 사유이며, 실제 상태는 `push_status`를 함께 봅니다. `pending`이면 다음 시각 이후 처리 대상이고 `successfulProfileIds = []`이면 기록된 성공 기기가 없습니다.
- 기존 코드의 `unknown_error`는 Firebase 환경 변수 누락도 포함합니다. 진단 개선 코드에서는 이 경우 `app/missing-configuration`을 저장하며 서버 로그의 `missing` 배열에 누락된 변수 이름을 표시합니다. 다른 `unknown_error`는 별도로 조사합니다.
- 환경 변수 수정은 운영 서버 재배포 후 반영됩니다. 기존 pending 알림은 생성 후 24시간 이내이며 cron이 동작할 때 다음 예정 시각 이후 다시 처리됩니다. 새 설정 배포만으로 발송 작업이 실행되지는 않습니다. `push_next_attempt_at` 도래 후에도 `push_attempts`가 그대로면 cron 실행 여부를 확인합니다.
- 이미 `failed/retry_window_expired`로 종결한 기록이나 성공 기록은 진단 중 임의로 초기화하지 않습니다.

---

### 2.6 Google 계정 추가 로그인 설정

`/profile`의 Google 계정 추가는 Supabase의 수동 identity 연결을 사용합니다. 기존 회원 ID와 앱 DB 스키마는 유지하며, 이 기능 때문에 앱 DB 마이그레이션이나 타입 재생성이 필요하지 않습니다.

1. Supabase Dashboard의 Authentication 설정에서 **Enable Manual Linking**을 활성화합니다. 자체 호스팅에서는 `GOTRUE_SECURITY_MANUAL_LINKING_ENABLED=true`를 사용합니다. [Supabase 공식 연결 안내](https://supabase.com/docs/guides/auth/auth-identity-linking)를 참고합니다.
2. **Authentication > URL Configuration > Redirect URLs**에 각 환경의 기존 로그인 콜백과 연결 콜백을 허용합니다. 연결 콜백은 `intent=link`와 요청마다 다른 `link_state` 쿼리를 포함하므로 nonce까지 고정한 주소 한 개를 등록하면 안 됩니다.

   | 환경 | 일반 로그인 주소 | Google 계정 추가 허용 패턴 |
   | :--- | :--- | :--- |
   | 로컬 | `http://localhost:3000/auth/callback` | `http://localhost:3000/auth/callback\?intent=link&link_state=*` |
   | 운영 | `https://<운영 도메인>/auth/callback` | `https://<운영 도메인>/auth/callback\?intent=link&link_state=*` |

   실제 사용 포트·도메인과 `redirectTo`에 맞춰 등록합니다. 위 패턴의 `\?`는 glob에서 물음표 문자 자체를, `*`는 변하는 nonce를 뜻합니다. 사이트 전체를 허용하는 `/**`보다 콜백 경로와 쿼리 접두사를 제한한 패턴을 사용합니다. 별도 preview 도메인을 쓰면 해당 환경도 등록합니다. 이 패턴은 [Redirect URLs 공식 문서](https://supabase.com/docs/guides/auth/redirect-urls)의 glob 이스케이프 규칙을 적용한 예시이며 2026-09-27 연결된 SOKNA 프로젝트의 로컬·운영 주소에서 설정 저장과 OAuth 취소 리다이렉트 매칭을 확인했습니다.
3. 같은 브라우저에서 소크나 계정으로 로그인한 뒤 프로필의 추가 버튼으로 시작합니다. Google 설정의 OAuth callback은 Supabase Auth의 기존 callback을 유지하며, 위 앱 콜백은 Supabase가 인증 후 돌아올 주소입니다.
4. 두 번째 Google 계정을 연결한 후 로그아웃하고 각각의 Google 계정으로 로그인하여 같은 사용자 ID·회원 승인·공연 참가 기록이 유지되는지 확인합니다. 이미 다른 소크나 계정에 연결된 Google 계정은 병합되지 않고 오류가 안내되어야 합니다.

**확인 상태 (2026-09-27)**: `manual_linking_disabled` 오류의 원인인 Manual Linking 비활성과 연결 콜백 누락을 확인한 뒤 사용자 승인으로 수정했습니다. 연결된 SOKNA 프로젝트의 `security_manual_linking_enabled = true`와 허용 목록을 관리 API로 재조회했습니다. 기존 `http://localhost:3000/auth/callback`을 유지하고 `https://sokna-pink.vercel.app/auth/callback` 및 위 두 환경의 연결 콜백 패턴을 추가했습니다. 변경된 설정은 수동 연결 플래그와 `uri_allow_list` 두 항목뿐입니다. 로컬·운영 OAuth 요청을 만들고 즉시 취소하여 지정한 콜백 경로와 nonce가 보존되는 HTTP 302 응답을 확인했습니다. 실제 Google 계정 인증·연결 E2E는 미검증입니다. 코드 구현·정적 검사 성공과 운영 활성화 완료를 구분합니다. 상세 명세는 [여러 Google 계정 로그인](../features/login-methods.md)을 참고합니다.

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
