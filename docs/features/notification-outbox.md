# 알림 생성과 발송 구조 단순화

> 작성일: 2026-09-27
> 상태: 코드 검증 완료, 운영 전환 대기 — 공유 운영 DB에는 아직 미적용

## 1. 목적
공연별 중간 큐와 수신자별 발송 대기를 중복 관리하지 않고 `notifications` 하나를 계정 알림함과 발송 outbox로 사용한다. 메시지 문구는 공통 DB 함수에 모으고 제목 문자열에 의존한 처리를 제거한다.

## 2. 생성 및 수신 정책
- 후보곡 INSERT와 수신자별 알림 생성은 AFTER INSERT 트리거로 같은 트랜잭션에서 처리한다. 공연 참여 계정 중 등록자를 제외하며 푸시 미동의자도 인앱 알림은 저장한다.
- 완성된 가입 신청이 pending으로 진입할 때 users 트리거가 관리자 알림을 만든다. 이메일/Google 신청의 문구와 생성 경로를 통합한다. 미완성 OAuth 사용자와 이미 완성된 pending 프로필 재저장은 새 알림을 만들지 않는다.
- 승인 RPC는 기존 관리자 검사와 pending 상태 전이를 유지하고 공통 DB 함수로 승인 알림을 함께 저장한다.
- 서버 액션은 이미 저장된 해당 이벤트를 즉시 발송한다. 중단/전송 실패는 동일 notifications 행에서 복구한다.
- 알림함, 로그인 계정별 기기 수신, 동의, 읽음, 기기 로컬 복구 정책은 유지한다. 사용자가 알림함에서 개별 또는 모두 삭제한 notifications 행은 발송 대기에서도 제거된다. 진행 중 또는 FCM 접수된 전송의 회수는 보장하지 않는다. [삭제 API와 UI](./notification-inbox.md)를 따른다.

## 3. 스키마
- `gig_notification_queue` 제거. pending/processing은 기존 UUIDv5와 동일한 ID로 notifications에 이관하며 중복 INSERT는 기존 내용을 덮어쓰지 않는다.
- `notifications.event_type`, `event_key` 추가. 수신자와 이벤트 종류·키에 고유 제약을 둔다.
- 이벤트 종류: member_approval_requested, member_approved, nomination_added, legacy.
- `push_eligible` 제거. 발송 제외는 skipped 상태로 표현한다. 직접 INSERT의 기본값도 skipped이며, 공통 생성 함수만 수신 동의자를 pending으로 지정한다.
- `push_status`: pending(대기/재시도), accepted(대상 기기 FCM 접수 완료), skipped(동의/기기/사용자 없음), failed(영구 실패/기한 만료).
- `push_attempts`, `push_next_attempt_at`을 정수/시각 컬럼으로 분리한다.
- `push_progress` JSONB에는 성공 기기 ID와 기기별 실패만 보관한다. `push_error`는 짧은 사유 코드만 저장한다. 이전 상세 오류 문구는 이관 시 legacy_error로 정규화한다.
- `push_attempted_at`, `push_sent_at`, `read_at`은 유지한다. push_sent_at은 한 기기 이상 FCM 접수 시각이며 실제 표시/읽음과 다르다.

## 4. 처리 API
`processPendingPushNotifications({ eventType?, eventKey?, userId?, notificationIds?, limit? })` 하나로 즉시 처리와 cron을 통합한다.
DB가 pending이며 push_next_attempt_at이 도래한 행만 조회한다. 선점은 push_next_attempt_at을 5분 뒤로 바꾸고 시도 횟수를 증가시킨다. 완료 저장 시 선점 시각과 다음 시각을 비교하여 오래된 실행이 새 실행을 덮어쓰지 못하게 한다. processing 상태 및 별도 회수 UPDATE는 제거한다.
일시 오류는 기존 1분/5분/15분/1시간과 0~20% 지연, 생성 후 24시간 한도를 유지한다. 성공/영구 실패 기기는 재시도에서 제외한다.
이메일 가입 액션은 Supabase 가입 결과의 계정 ID와 DB의 applied_at으로 정확한 신청 이벤트 키를 조회한다. 이메일 확인 전 세션이 없어도 해당 신청만 처리하며, 공개 성공 응답은 계정 존재 여부나 처리 건수를 노출하지 않는 `{ ok: true }`로 통일한다.

## 5. 운영 전환
운영과 개발이 같은 DB를 사용하므로 새 코드 배포와 DB 마이그레이션을 함께 전환한다. 운영 DB에는 검토/검증 전 변경하지 않는다. 기존 sent는 accepted로 옮기고 종결된 알림을 재발송하지 않는다. 기존 재시도 체크포인트와 진행 중인 5분 선점도 보존한다.
2026-09-27 읽기 전용 점검 시 미처리 공연 큐 2건과 완료 큐 2건을 확인했으며 실제 이관은 배포 시점 데이터를 기준으로 실행한다. 24시간 이상 지난 미처리 큐에서 새로 생성되는 동의자 알림은 failed/retry_window_expired로 종결하여 뒤늦은 푸시를 보내지 않는다. 이미 생성된 알림의 시각·읽음·발송 진행은 보존하고 미동의자의 skipped도 유지한다.
[운영 전환 절차](../maintenance/environment-setup.md#23-알림-outbox-구조-전환)에 따라 구 서버 쓰기와 cron을 중지하고 진행 중인 작업을 종료한 후 DB·서버를 전환한다. 별도 주기 호출 설정 확인은 여전히 필요하다.

## 6. 검증
- 전체 자동 테스트 **254개 통과**, 변경 소스·테스트 ESLint, TypeScript 및 프로덕션 빌드 통과.
- 실제 PostgreSQL 엔진 기반의 임시 PGlite에서 이전 스키마·합성 데이터를 구성하여 마이그레이션과 SQL 회귀를 실행했고 통과했다. 검증 DB의 알림 컬럼 목록과 TypeScript Row 필드가 정확히 일치함도 확인했다. 운영 데이터에 테스트 쓰기를 하거나 실제 FCM을 호출하지 않는다.
- SQL 회귀 파일은 [tests/notification-outbox.sql](../../tests/notification-outbox.sql). 격리 DB에서 먼저 파일의 SETUP_BEFORE_MIGRATION 주석 블록을 실행하고, 마이그레이션 적용 후 파일 전체를 실행한다. 기존 성공·부분 성공·중단 큐, 만료, 동의 제외, 가입/후보곡 원자성, 중복, 권한을 검증한다.
- `npm run types` 실행 성공. 연결된 DB는 아직 이전 구조이므로 생성 결과에 이번 마이그레이션의 컬럼·함수 계약을 반영했으며, 운영 전환 후 다시 생성한다. 기존 별도 동의 시각 타입은 보존한다.

## 7. 화면 및 정책
새 화면은 추가하지 않는다. 기존 헤더 종 버튼과 계정 알림함을 유지한다. 클라이언트에서는 중복 상태 버전 변수, 같은 알림 타입 정의, 서비스 워커 activate 리스너만 정리하며 계정 격리와 복구 예산은 유지한다.
