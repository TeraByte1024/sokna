# 알림함 및 읽음 상태 명세

> **작성일자**: 2026-09-27  
> **상태**: 알림함 구현 및 기존 읽음 DB 마이그레이션 검증 완료. 알림 outbox 구조 최적화는 공유 운영 DB 미적용이며 새 코드와 동시 전환 필요.

## 1. 배경 및 목적

푸시를 놓치거나 푸시 수신에 동의하지 않은 회원도 앱 안에서 본인의 알림 내역을 확인할 수 있도록 합니다. 헤더 프로필 아이콘 왼쪽의 종 버튼에 읽지 않은 알림 수를 표시하고, 팝업에서 최근 알림과 이전 알림을 확인합니다. 목록과 읽음 상태는 `notifications.user_id` 기준으로 계정에 귀속되며 기기마다 따로 만들지 않습니다. 한 기기에서 읽으면 같은 계정의 다른 기기도 다음 목록 갱신 때 반영합니다. 인앱 읽음 상태와 FCM 발송 결과는 서로 독립적입니다.

## 2. 세부 요구사항

### 2.1 사용자 시나리오

1. 로그인한 사용자는 헤더의 종 버튼과 본인의 전체 미확인 알림 수를 확인합니다. 데스크톱은 프로필 바로 왼쪽, 모바일은 우측 상단 헤더에 배치하며 하단 내비게이션에는 추가하지 않습니다. 관리자 여부나 푸시 수신 동의 여부로 알림함 접근을 제한하지 않습니다. 배지는 99개를 넘으면 `99+`로 표시합니다.
2. 종 버튼을 누르면 최신 알림 20개를 표시하며, `더 보기`로 이전 알림을 20개씩 추가합니다. 미확인 수는 현재 페이지의 개수가 아닌 전체 알림 중 `read_at IS NULL`인 개수입니다.
3. 알림을 누르면 해당 알림을 읽음으로 저장하고 내부 링크로 이동합니다. 기존 페이지의 작성 중 이탈 확인을 유지합니다. 이탈 확인이 표시되면 이동을 승인했을 때 읽음 처리하며 취소하면 미확인 상태를 유지합니다. 팝업을 열기만 해서는 읽음으로 변경하지 않습니다.
4. `모두 읽음`은 처음 목록을 불러온 기준 시각까지의 본인 알림만 처리합니다. 팝업을 연 뒤 새로 생성된 알림은 미확인 상태로 남습니다.
5. 로그아웃하거나 다른 계정으로 변경하면 이전 계정의 목록과 개수를 화면에서 제거합니다. 늦게 도착한 이전 요청의 결과로 새 계정 화면을 덮어쓰지 않습니다.

### 2.2 제약 및 오류 처리

- 서버는 매 요청 `auth.getUser()`로 현재 사용자를 확인하며, 조회와 쓰기 모두 해당 `user_id`로 제한합니다. 클라이언트가 전달한 사용자 ID만으로 권한을 부여하지 않습니다.
- 읽음 쓰기는 `expectedUserId`와 현재 세션이 같아야 합니다. 계정이 바뀌었으면 쓰기를 거절하고 목록을 다시 열도록 안내합니다.
- 클라이언트에 새 테이블 UPDATE 권한을 부여하지 않습니다. 읽음 서버 액션만 서버 전용 클라이언트로 `read_at`을 변경하며, 검증된 `user_id` 조건을 항상 포함합니다. 액션 입력으로 제목·본문·수신자·푸시 상태를 받지 않습니다. 기존 DB RLS 및 직접 API 권한은 이 변경에서 수정하지 않습니다.
- 조회 오류는 빈 목록이나 미확인 0개로 처리하지 않습니다. SSR 최초 개수 조회 실패는 `null`로 구분하며, 팝업은 오류 안내와 다시 시도를 제공합니다. 쓰기 또는 후속 개수 조회가 실패하면 오류를 반환합니다. 이미 저장된 읽음은 안전하게 재시도할 수 있습니다.
- 알림 링크는 현재 사이트의 `/`로 시작하는 내부 경로만 반환합니다. 외부 URL, `//`, 역슬래시 및 잘못된 URL은 `/`로 대체합니다.

## 3. 데이터 모델

| 테이블 | 컬럼 | 타입 | Nullable | 의미 |
| :--- | :--- | :--- | :--- | :--- |
| `notifications` | `read_at` | `timestamptz` | YES | 최초 읽음 시각. null은 미확인 |

- 마이그레이션: `supabase/migrations/20260926151654_add_notification_read_state.sql`.
- 기존 알림은 모두 `read_at = null`로 시작하며 기존 내용과 푸시 상태는 변경하지 않습니다.
- `(user_id, created_at DESC, id DESC)` 목록 인덱스와 `read_at IS NULL`인 행의 `user_id` 인덱스를 추가합니다.
- 단일 읽음과 모두 읽음은 `read_at IS NULL`인 행만 수정하므로 최초 읽음 시각을 덮어쓰지 않습니다.
- 알림 생성은 업무 변경과 같은 DB 트랜잭션에서 처리하며 `created_at`은 해당 생성 시각입니다. 기존 구조 이관 중 누락된 인앱 내역을 만들 때도 실제 생성 시각을 사용하여 이전 모두 읽음 기준에 포함되지 않게 합니다. 이관 세부 규칙은 [알림 outbox 명세](./notification-outbox.md)를 따릅니다.

## 4. 서버 API

서버 액션 위치: `app/notifications/actions.ts`. 공통 타입과 SSR 조회: `lib/notifications.ts`.

### `listNotificationsAction(input = {})`

입력:

```ts
{
  cursor?: { created_at: string; id: string } | null;
  cutoff?: string;
  expectedUserId?: string;
}
```

성공 결과:

```ts
{
  ok: true;
  userId: string;
  items: Array<{
    id: string;
    title: string | null;
    body: string | null;
    link: string | null;
    created_at: string;
    read_at: string | null;
  }>;
  unreadCount: number;
  nextCursor: { created_at: string; id: string } | null;
  cutoff: string;
}
```

첫 조회는 서버 시각을 `cutoff`로 반환합니다. 더 보기 요청은 동일 cutoff와 nextCursor를 사용합니다. 목록은 `created_at DESC, id DESC`로 정렬하고 cursor보다 작은 행을 가져옵니다. 21번째 행이 있으면 다음 cursor를 반환하고 화면 데이터는 20개로 제한합니다. 동일 생성 시각에서도 UUID로 순서를 고정합니다. 미확인 개수는 cutoff와 무관하게 현재 전체 개수입니다.

### `markNotificationReadAction(id, expectedUserId)`

본인 알림 존재를 확인하고 미확인 행의 `read_at`만 저장합니다. 다른 계정의 알림 ID 또는 삭제된 알림 ID는 찾을 수 없음으로 응답합니다.

### `markAllNotificationsReadAction(cutoff, expectedUserId)`

검증된 본인의 `created_at <= cutoff AND read_at IS NULL` 행만 처리합니다. 목록에 아직 더 보기로 불러오지 않은 이전 알림도 포함하며 cutoff 이후 신규 알림은 제외합니다.

두 읽음 액션의 성공 결과는 `{ ok: true, userId, unreadCount, readAt }`입니다. 모든 액션의 실패 결과는 `{ ok: false, error: string }`입니다. 잘못된 UUID·cursor·날짜·미래 cutoff는 DB 변경 전에 거절합니다.

### `getUnreadNotificationCount(expectedUserId)`

헤더 SSR에서 사용하며 `Promise<number | null>`을 반환합니다. 확인된 빈 알림함은 0, 인증·계정 불일치·조회 실패는 null입니다.

## 5. 알림 생성과 푸시의 관계

- 계정별 `notifications`가 알림함과 유일한 발송 outbox입니다. 제목·본문·링크는 직접 실행 권한이 제한된 공통 DB 헬퍼 `create_app_notification()`에서 생성하며 저장된 문구를 알림함과 푸시가 함께 사용합니다.
- 회원가입 신청 트리거, 회원 승인 RPC, 후보곡 INSERT 트리거가 업무 변경과 같은 트랜잭션으로 알림을 저장합니다. 후보곡은 공연에 계정으로 연결된 참여자 중 등록자를 제외합니다.
- `event_type`/`event_key`로 이벤트를 식별하고 `(user_id, event_type, event_key)` 고유 제약으로 계정별 중복을 막습니다. 제목 문자열은 조회나 중복 판정 조건으로 쓰지 않습니다.
- 생성 시 푸시 미동의자는 인앱 내역을 유지하며 `push_status = skipped`, `push_error = not_opted_in`으로 종결합니다. 나중에 동의해도 해당 알림은 재발송하지 않습니다.
- 실제 푸시 처리에서도 동의 및 현재 기기 연결을 다시 검증합니다. pending/accepted/skipped/failed는 발송 상태이며 `read_at`과 독립적입니다. accepted는 FCM 접수 완료일 뿐 표시·읽음 확인이 아닙니다.
- 즉시 발송과 cron은 같은 `processPendingPushNotifications()`를 사용합니다. 서버 재시도와 기기 로컬 복구는 [푸시 알림 명세](./push-notifications.md)를 따르며, 이 구조 변경의 운영 전환은 [알림 outbox 명세](./notification-outbox.md)를 따릅니다.

## 6. UI 및 검증

- `components/auth-button.tsx`: 본인 미확인 개수 SSR과 프로필 왼쪽 알림 버튼 배치.
- `components/notification-menu.tsx`: 목록 팝업, 더 보기, 단일/모두 읽음 및 오류 안내.
- `components/notification-menu-state.ts`: 계정·요청 버전으로 늦은 응답을 차단하고 읽음 쓰기를 직렬화합니다. `lib/notifications.ts`의 알림 타입을 type-only로 재사용하며 서버 런타임 모듈을 클라이언트에 포함하지 않습니다.
- `lib/confirmed-navigation.ts`, `components/ui/leave-confirm-dialog.tsx`: 이탈 확인에서 승인한 링크의 클릭 당시 메타데이터를 전달합니다. 팝업 DOM이 사라져도 현재 계정이 일치하면 읽음 처리를 이어갑니다.
- 서버 검증: 인증 실패·다른 계정·잘못된 입력 차단, 20개 페이지와 전체 개수 구분, 동률 cursor, cutoff 이후 신규 알림 보존, 최초 읽음 시각 보존, 쓰기 오류 및 안전한 링크.
- UI 검증: 계정 변경 중 응답 경합, 더 보기 중복 방지, 읽음 표시 및 cutoff 유지, 재시도, 접근성.
- DB의 마이크로초 정밀도를 유지하여 모두 읽음 기준 시각 직후 생성된 알림을 UI에서도 미확인으로 남깁니다.
- 푸시 표시 후 서비스 워커의 `SOKNA_NOTIFICATIONS_CHANGED` 메시지와 창 포커스·온라인 복구·다시 표시 시 목록과 배지를 갱신합니다. 팝업은 모바일 화면 폭과 남은 높이에 맞춰 표시합니다.
- 후보곡 검증: 미동의자는 인앱에 포함되지만 실제 FCM 발송에서는 제외됩니다.
- 2026-09-27 연결된 DB에서 `column notifications.read_at does not exist` 오류를 확인하고 읽음 상태 마이그레이션을 적용했습니다. 실제 Supabase API의 미확인 개수 조회가 HTTP 200으로 성공함을 확인했고 `npm run types`를 재실행했습니다. 알림 데이터 및 기존 DB 권한은 변경하지 않았습니다. 다른 환경 배포 전에도 같은 마이그레이션 적용이 필요합니다.
