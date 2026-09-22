# 선곡회의 곡 수정 하이라이팅 및 지연 알림 큐 명세 (Setlist Highlights & Notification Queue)

## 1. 개요
선곡회의 페이지(`/gigs/[id]/nominations`)에서 공연 참여 세션원들이 후보곡을 추천하고 조율할 때, **마지막으로 화면을 확인한 이후 수정되거나 새로 등록된 곡을 직관적으로 식별**할 수 있도록 시각적 하이라이트를 제공하고, **새 곡이 등록되었을 때 일정 시간(15분 디바운스 버퍼) 동안 추가 등록되는 곡들을 모아서 공연 참여자들에게 일괄 알림**을 전달하는 기능입니다.

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
   - **개별 확인**: 곡 카드를 클릭하여 상세 서랍(`SetlistDrawer`)을 열람하면 해당 곡의 하이라이트가 즉시 해제됩니다.
   - **모두 확인 완료**: 상단 배너의 `[모두 확인 완료]` 버튼 클릭 시 모든 곡의 하이라이트가 해제되고 현재 시각이 DB `setlist_views` 및 `localStorage`에 즉시 저장됩니다.
   - **빠른 필터**: 변경/신규 곡이 1건 이상 있을 경우 상단 툴바에 `[✨ 변경된 곡 N개]` 원클릭 토글 필터 버튼이 노출되어 변경된 곡들만 모아볼 수 있습니다.

---

### 2.2 새 곡 지연 알림 큐 (Debounced Notification Queue)
1. **목적**:
   - 여러 곡을 연달아 등록하거나 등록 직후 오타/정보를 수정할 때 발생하는 무분별한 연속 알림(알림 피로도)을 방지.
2. **큐 등록 (`enqueueSongNotification`)**:
   - 새 곡 등록 시 `gig_notification_queue`에 예약 레코드 생성 (`scheduled_at = now() + 15분`).
   - 15분 내에 동일한 공연에 추가로 곡이 등록되면 기존 대기열의 `song_ids`에 누적되고, `scheduled_at`이 마지막 등록 시점 기준 15분 후로 자동 연장(디바운스)됩니다.
3. **발송 처리 (`processNotificationQueue`)**:
   - `scheduled_at <= now() AND status = 'pending'`인 만료 대기열을 조회하여 처리.
   - 해당 공연의 참여 세션원(`performers`) 중 유효 계정이며 `users.marketing_opt_in = true`인 부원들에게 `notifications` 테이블에 일괄 등록하고 FCM 푸시 발송:
     - **제목**: `🎵 [공연명] 새 후보곡 N건 등록`
     - **본문**: 곡 명칭 요약 (예: `'곡1', '곡2'이(가) 선곡회의에 추천되었습니다. 지금 세션 편성과 악보를 확인해보세요!`)
     - **링크**: `/gigs/:id/nominations`
   - **수신 제외**: 곡을 등록한 본인(`triggered_by`)과 마케팅 알림 미동의 계정은 자동 제외.
   - 발송 완료 시 `status = 'sent'`, `sent_at = now()`로 상태 전이.
4. **발송 트리거 파이프라인**:
   - **Cron 엔드포인트**: `/api/cron/notifications` (`CRON_SECRET` Bearer 인증, 외부 스케줄러에서 매분 호출)
   - **Passive Drain**: 새 곡 등록 시 백그라운드에서 이전 만료 큐가 있을 경우 즉시 함께 소진 처리.

---

## 3. 관련 파일 링크
- 선곡 패널 컴포넌트: [components/setlists/setlist-panel.tsx](file:///d:/dev/sokna/components/setlists/setlist-panel.tsx)
- 알림 큐 및 헬퍼: [lib/setlist-notifications.ts](file:///d:/dev/sokna/lib/setlist-notifications.ts)
- 선곡회의 서버 액션: [app/gigs/[id]/nominations/actions.ts](file:///d:/dev/sokna/app/gigs/[id]/nominations/actions.ts)
- Cron API 라우트: [app/api/cron/notifications/route.ts](file:///d:/dev/sokna/app/api/cron/notifications/route.ts)
- DB 마이그레이션: [supabase/migrations/20260916020000_add_setlist_views_and_notification_queue.sql](file:///d:/dev/sokna/supabase/migrations/20260916020000_add_setlist_views_and_notification_queue.sql)
