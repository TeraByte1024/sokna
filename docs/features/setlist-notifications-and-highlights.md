# 선곡회의 곡 수정 하이라이팅 및 즉시 알림 명세 (Setlist Highlights & Notifications)

## 1. 개요
선곡회의 페이지(`/gigs/[id]/nominations`)에서 공연 참여 세션원들이 후보곡을 추천하고 조율할 때, **마지막으로 화면을 확인한 이후 수정되거나 새로 등록된 곡을 직관적으로 식별**할 수 있도록 시각적 하이라이트를 제공하고, **새 곡이 등록되면 등록자를 제외한 공연 참여자들에게 즉시 알림**을 전달하는 기능입니다. 별도 지연 예약 없이 후보곡과 계정 알림을 함께 저장한 뒤 즉시 발송합니다.

---

## 2. 세부 명세

### 2.1 마지막 조회 이후 변경 곡 하이라이팅 (Change Highlighting)
1. **기준 시점 (`last_viewed_at`) 관리**:
   - 사용자가 선곡회의 화면에 접속하면 `setlist_views` 테이블 및 `localStorage`에서 이전 확인 시점(`last_viewed_at`)을 로드합니다.
   - 화면을 새로고침하거나 유지하는 동안 하이라이트가 즉시 사라지지 않도록, 페이지 마운트 시의 기준 시점을 고정하여 비교합니다.
2. **하이라이트 판별 조건**:
   - **신규 곡 (`isNew`)**: `song.created_at > last_viewed_at`
   - **수정된 곡 (`isUpdated`)**: `song.updated_at > last_viewed_at`이며 `song.created_at`과 2초 이상 차이날 때
3. **시각적 UI 디자인**:
   - **신규 곡**: 에메랄드 뱃지(`[✨ 신규]`), 카드 테두리 에메랄드 글로우/링, 좌측 에메랄드 컬러 바.
   - **수정된 곡**: 앰버 뱃지(`[✏️ 수정됨]`), 카드 테두리 앰버 글로우/링, 좌측 앰버 컬러 바.
4. **확인 완료(Clear) 인터랙션**:
   - **개별 확인**: 곡 카드를 클릭하여 상세 서랍(`NominationDrawer`)을 열람하면 해당 곡의 하이라이트가 즉시 해제됩니다.
   - **모두 확인 완료**: 상단 배너의 `[모두 확인 완료]` 버튼 클릭 시 모든 곡의 하이라이트가 해제되고 현재 시각이 DB `setlist_views` 및 `localStorage`에 즉시 저장됩니다.
   - **빠른 필터**: 변경/신규 곡이 1건 이상 있을 경우 상단 툴바에 `[✨ 변경된 곡 N개]` 원클릭 토글 필터 버튼이 노출되어 변경된 곡들만 모아볼 수 있습니다.

---

### 2.1.1 마지막 응답 이후 원문 수정 안내

- 읽음 하이라이트와 별도로, 현재 응답 가능한 세션의 저장된 나의 응답보다 후보곡 수정 시각이 늦으면 기본 목록의 `응답 후 수정됨` 배지와 간략 목록의 주황색 아이콘으로 표시합니다.
- 상세의 `나의 응답`에는 **마지막 응답 이후 글이 수정되었습니다** 안내와 `응답 다시 확인` 버튼을 표시합니다.
- 곡 열람/모두 확인으로 해제되지 않으며, 응답 재저장 성공 시 해제합니다. 내용이 동일한 후보곡 저장은 수정 시각을 갱신하지 않습니다.
- 세션별 판정 및 저장 결과 규칙은 [응답 이후 후보곡 수정 안내](./nomination-response-review.md)를 따릅니다.

### 2.2 새 곡 즉시 알림

1. **원자적 생성**:
   - 후보곡 INSERT의 `nominations_notify_added` DB 트리거가 같은 트랜잭션에서 수신자별 `notifications`를 만듭니다. 알림 저장이 실패하면 후보곡 등록도 롤백합니다.
   - 공연에 계정으로 연결된 참여자 중 등록자를 제외합니다. 한 계정이 여러 참여 세션을 갖더라도 알림은 한 번만 만듭니다. 인증 세션이 없는 DB 실행은 `created_by`에 연결된 계정으로 등록자를 판단합니다.
   - 알림 종류는 `nomination_added`, 이벤트 키는 `nomination:<후보곡 ID>`입니다. `(user_id, event_type, event_key)` 고유 제약으로 이벤트별 중복을 막습니다. 후보곡 수정은 새 등록 알림을 만들지 않습니다.
2. **내용과 인앱 기록**:
   - 제목·본문·링크는 비공개 실행 권한의 공통 DB 헬퍼 `create_app_notification()`에서 생성합니다. 상세 템플릿과 생성 권한은 [알림 outbox 명세](./notification-outbox.md)를 따릅니다.
   - 제목은 `[공연명] 선곡회의 새 후보곡 등록`, 본문은 후보곡 안내 및 세션 응답 요청, 링크는 `/gigs/:id/nominations?song=<후보곡 ID>`이며 해당 후보곡 상세를 바로 엽니다. 저장된 내용은 이후 템플릿을 바꿔도 유지합니다.
   - 푸시 미동의자도 인앱 내역을 저장하되 `push_status = skipped`, `push_error = not_opted_in`으로 종결합니다. 동의자의 내역은 pending으로 만들고 실제 발송 전 동의를 다시 확인합니다.
   - `created_at`은 알림 생성 트랜잭션의 시각이며 별도 지연 예약을 두지 않습니다.
3. **즉시 발송과 복구**:
   - 등록 서버 액션이 `processPendingPushNotifications({ eventType: "nomination_added", eventKey: "nomination:" + inserted.id })`를 await하여 저장된 이벤트를 즉시 발송합니다.
   - FCM 오류로 후보곡과 인앱 알림을 다시 생성하지 않습니다. 기존 outbox의 상태와 기기별 결과를 갱신하여 복구합니다.
   - 상태는 pending/accepted/skipped/failed입니다. accepted는 FCM 접수 완료이며 기기 표시나 읽음을 뜻하지 않습니다.
   - 현재 로그인 계정으로 연결된 기기에만 발송하고, 서비스 워커도 표시·클릭 직전 계정을 검증합니다. 로그아웃은 기기 등록을 보존하며 이전 계정의 지연 알림은 차단합니다.
   - `/api/cron/notifications`가 CRON_SECRET Bearer 인증 후 발송 가능한 pending 알림만 처리합니다. 5분 선점 복구, 기기별 성공 제외, 1분·5분·15분·1시간과 지터를 포함한 재시도, 24시간 한도는 [푸시 알림 명세](./push-notifications.md#41-수신자별-결과와-재시도)를 따릅니다.

### 2.2.1 기존 응답자에게 후보곡 수정 알림

- 원문이 실제로 변경되면 수정 후에도 **이미 응답한 세션**이 필요 세션으로 남아 있고, 해당 세션의 응답 대상인 현재 공연 참여자에게만 알림을 생성합니다. 저장한 응답이 없거나 기존 응답 세션이 모두 삭제/응답 대상 제외된 사용자는 수신하지 않습니다.
- 수정자는 제외하고, 여러 세션에 응답했어도 계정당 한 번만 생성합니다. 배정 세션 별칭, 추천 보컬, 자유 세션 규칙을 적용합니다.
- 제목은 `[공연명] 선곡회의 후보곡 수정`, 본문은 `'곡명'의 내용이 수정되었습니다. 변경된 내용을 확인해주세요.`이며 해당 곡 상세로 연결합니다.
- UPDATE 트리거가 알림을 원문 변경과 같은 트랜잭션에 저장하고, 수정 액션은 해당 수정 이벤트만 즉시 발송합니다. DB 직접 수정은 cron이 처리합니다. 푸시 동의와 실패 재시도 정책을 유지합니다.
- 구현/적용 상태는 [후보곡 수정 알림](./nomination-update-notifications.md)을 따릅니다. 2026-10-08 연결된 DB에 적용하고 원격 이력/타입 재생성을 확인했습니다. 시험 알림은 보내지 않았으며, 적용 전 원문 변경에는 소급 알림을 생성하지 않습니다.

### 2.3 기존 구조 이관과 배포

- `20260927000000_simplify_notification_outbox.sql`에서 `gig_notification_queue`를 폐지합니다. 미처리 항목은 기존 UUID 규칙으로 계정 outbox에 이관하고 이미 생성된 알림의 내용·읽음·발송 결과는 덮어쓰지 않습니다.
- 기존 `push_eligible`과 `processing` 상태를 제거하고 기존 `sent`는 `accepted`로 옮깁니다. 재시도 체크포인트와 진행 중인 선점은 보존합니다.
- 현재 공유 운영 DB에는 이 최적화 마이그레이션을 적용하지 않았습니다. 새 서버 코드·cron과 DB 스키마를 함께 전환해야 합니다. [운영 전환 절차](../maintenance/environment-setup.md#23-알림-outbox-구조-전환)를 따릅니다.

---

## 3. 관련 파일 링크

- 선곡 패널: [nomination-panel.tsx](../../components/nominations/nomination-panel.tsx)
- 마지막 확인 시각: [nomination-views.ts](../../lib/nomination-views.ts)
- 선곡회의 서버 액션: [actions.ts](<../../app/gigs/[id]/nominations/actions.ts>)
- 공통 발송 처리기: [push-notifications.ts](../../lib/push-notifications.ts)
- Cron API: [route.ts](../../app/api/cron/notifications/route.ts)
- 원자적 생성·문구·이관 마이그레이션: [simplify_notification_outbox.sql](../../supabase/migrations/20260927000000_simplify_notification_outbox.sql)
