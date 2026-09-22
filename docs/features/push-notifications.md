# 웹 푸시 알림 명세 (Firebase Cloud Messaging)

## 1. 목적과 범위

FCM Web Push로 모바일/데스크톱 브라우저에 다음 이벤트를 알립니다.

1. 신규 사용자가 회원가입 승인을 요청하면 관리자에게 알림
2. 관리자가 회원가입을 승인하면 승인된 사용자에게 알림
3. 선곡회의에 새 후보곡이 등록되면 등록자를 제외한 공연 참여자에게 알림

두 이벤트 모두 `users.marketing_opt_in = true`인 계정만 실제 푸시 대상이 됩니다. 클라이언트 입력만 신뢰하지 않고 서버 발송 직전에 다시 검사합니다.

## 2. 사용자 수신 설정

1. 사용자는 `/profile`의 기존 정보 수정 폼에서 `앱 푸시 알림 수신 동의` 여부를 확인하고 변경합니다. 별도의 푸시 설정 카드는 표시하지 않습니다.
2. 헤더 프로필 팝업의 `이 기기에서 알림 받기` 토글을 눌러 브라우저 권한을 허용합니다.
3. 아직 수신에 동의하지 않은 사용자가 토글을 켜면 먼저 수신 동의 다이얼로그를 표시하고, 사용자가 명시적으로 동의한 경우에만 동의 저장과 기기 토큰 등록을 순서대로 수행합니다.
4. 브라우저가 발급한 FCM 토큰을 `profiles`에 기기별로 저장합니다.
5. 수신 동의를 철회하면 해당 사용자의 모든 `profiles` 토큰을 즉시 삭제합니다.
6. 사용자는 프로필 팝업 토글을 꺼서 현재 기기 토큰만 해제할 수 있습니다.

서비스 워커 `/firebase-messaging-sw.js`는 Firebase Messaging SDK를 초기화해 페이지가 닫힌 백그라운드 상태에서도 알림 payload를 표시합니다. 로그아웃 상태에서도 브라우저가 서비스 워커를 갱신할 수 있도록 인증 프록시의 공개 경로로 유지합니다. 로그인 세션은 푸시 수신 조건이 아닙니다.

권한 요청은 브라우저 정책에 맞게 사용자 버튼 클릭에서만 실행합니다. iOS/iPadOS에서는 웹 푸시를 위해 홈 화면에 추가한 웹 앱에서 설정해야 할 수 있습니다.

## 3. 발송 파이프라인

### 3.1 회원가입 승인 요청

- 이메일 가입: Supabase `handle_new_user()` 트리거가 필수 프로필 데이터가 있는 경우 관리자별 `notifications` outbox 레코드를 생성합니다.
- Google 가입: 최초 OAuth 시점에는 필수 프로필이 없으므로 알림을 만들지 않고, `/auth/complete-profile` 완료 시 생성합니다.
- `push_eligible = true`, `push_status = 'pending'` 레코드를 생성한 직후 가입 완료 서버 흐름에서 FCM 발송을 즉시 시도합니다.
- 이메일 가입은 DB 트리거가 outbox를 생성한 뒤 가입 폼의 서버 액션이 가입 관련 pending 레코드만 처리하고, Google 가입은 프로필 완성 액션이 새로 생성한 정확한 outbox ID를 처리합니다.

### 3.2 회원가입 승인 완료

- 관리자가 `/admin/members`에서 `pending` 사용자를 승인하면 DB 함수 `approve_member_with_notification()`이 상태 변경과 "회원가입 승인 완료" 인앱 알림 생성을 하나의 트랜잭션으로 처리합니다.
- 같은 알림 레코드에 `push_eligible = true`, `push_status = 'pending'`을 설정하며 cron이 마케팅 수신 동의 및 활성 기기 토큰을 다시 검사한 뒤 FCM으로 발송합니다.
- 승인 업데이트는 `pending` 상태에서만 성공하도록 제한하여 중복 승인 요청으로 동일 알림이 여러 번 만들어지지 않게 합니다.
- 알림 클릭 시 `/members`로 이동합니다.
- 승인 액션은 outbox 생성 직후 해당 사용자의 승인 완료 알림을 즉시 FCM으로 발송합니다.

### 3.3 선곡회의 새 후보곡

- 신규 곡을 `gig_notification_queue`에 넣고 마지막 등록 이후 15분으로 예약 시각을 연장합니다.
- cron이 만료된 큐를 선점하고 공연 참여자 중 등록자를 제외합니다.
- 마케팅 동의자를 한 번 더 제한하고 `notifications` 로그를 만든 뒤 FCM으로 발송합니다.

### 3.4 스케줄러와 보안

- 엔드포인트: `GET/POST /api/cron/notifications`
- 스케줄러: Vercel Pro/Enterprise Cron 또는 Supabase Cron에서 1분 간격 호출
- 가입 요청 및 가입 승인 완료 알림은 cron 주기와 무관하게 이벤트 처리 중 즉시 발송하며, cron은 남은 `pending` outbox 복구용입니다. 후보곡 알림의 15분 집계 규칙은 그대로 유지합니다.
- 프로덕션에서는 `Authorization: Bearer <CRON_SECRET>`가 반드시 필요합니다.
- 사용자 세션이 없는 외부 스케줄러 요청을 허용하기 위해 인증 프록시의 로그인 리다이렉트에서는 제외하되, 엔드포인트의 Bearer 검증은 항상 적용합니다.
- DB outbox와 토큰 조회는 서버 전용 `SUPABASE_SECRET_KEY`를 사용합니다(기존 `SUPABASE_SERVICE_ROLE_KEY`도 호환).
- Firebase 발송은 서버 전용 Admin SDK 자격 증명을 사용합니다.

## 4. 전달 상태

`notifications`의 푸시 관련 필드:

| 필드 | 의미 |
| :--- | :--- |
| `push_eligible` | 이 로그가 푸시 발송 대상 이벤트인지 여부 |
| `push_status` | `pending`, `processing`, `sent`, `skipped`, `failed` |
| `push_attempted_at` | 발송 시도 시각 |
| `push_sent_at` | FCM 성공 시각 |
| `push_error` | 미발송/실패 사유 |

마케팅 미동의 또는 활성 토큰이 없는 계정은 FCM에 전달하지 않으며 `skipped`로 기록합니다. 만료되거나 해지된 FCM 토큰은 발송 응답에 따라 자동 삭제합니다.
사용자 계정이 삭제되면 알림 로그는 보존되고 `notifications.user_id`만 외래키 `ON DELETE SET NULL`로 해제되어 삭제 의존성을 만들지 않습니다.

## 5. 운영 설정

필요한 환경 변수와 Firebase/Supabase 콘솔 절차는 [개발 환경 설정 가이드](../maintenance/environment-setup.md)를 따릅니다. DB 마이그레이션 `20260922010000_enable_web_push_delivery.sql`을 배포하기 전에는 토큰 등록과 발송을 활성화하면 안 됩니다.

## 6. 관련 파일

- 브라우저 FCM: `lib/firebase/firebase.ts`, `lib/firebase/pushNotification.ts`
- Firebase Admin: `lib/firebase/admin.ts`
- 발송 및 outbox 처리: `lib/push-notifications.ts`
- 기기 설정 UI: `components/push-notification-settings.tsx`
- 서비스 워커: `app/firebase-messaging-sw.js/route.ts`
- cron: `app/api/cron/notifications/route.ts`
- DB: `supabase/migrations/20260922010000_enable_web_push_delivery.sql`
- 회원 승인 outbox 트랜잭션: `supabase/migrations/20260922020000_add_member_approval_push_notification.sql`
