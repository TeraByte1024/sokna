# 푸시 알림 명세 (Push Notifications)

## 1. 기능 개요
공연 공지, 선곡 회의 알림, 새로운 곡 등록 등 중요 이벤트를 동아리 회원들에게 브라우저 웹 푸시(Web Push)로 실시간 전달하기 위해 **Firebase Cloud Messaging (FCM)**을 사용합니다.

---

## 2. 세부 명세

### 2.1 클라이언트 FCM 수명주기
1. **권한 요청 (`requestNotificationPermission`)**:
   - `Notification.requestPermission()`을 통해 사용자 브라우저에 알림 수신 권한을 요청합니다.
   - 서비스 워커 미지원 환경이거나 권한 거부 시 예외를 반환합니다.
2. **FCM 토큰 발급 (`getFcmToken`)**:
   - `getToken(messaging, { vapidKey })`를 사용하여 클라이언트 토큰을 발급받습니다.
   - 환경 변수 `NEXT_PUBLIC_FIREBASE_VAPID_KEY`가 필요합니다.
3. **토큰 저장**:
   - 발급받은 토큰은 `profiles` 테이블(`fcm_token`, `device_name`, `user_id`)에 보관되어 향후 타겟 푸시 발송 시 참조됩니다.
4. **포그라운드 알림 수신 (`onForegroundMessage`)**:
   - 사용자가 웹을 이용 중일 때 도착한 알림은 `onMessage` 리스너를 통해 인앱 토스트 또는 알림으로 전달됩니다.

### 2.2 알림 히스토리 (`notifications` 테이블)
- 사용자에게 발송된 알림 내역은 `notifications` 테이블에 저장됩니다:
  - `user_id`: 수신 대상 유저 UUID
  - `title`: 알림 제목
  - `body`: 알림 본문
  - `link`: 클릭 시 이동할 URL (예: `/gigs/12/setlists`)
  - `created_at`: 발송 시각

---

## 3. 관련 파일 링크
- Firebase 초기화: [lib/firebase/firebase.ts](file:///c:/dev/sokna/lib/firebase/firebase.ts)
- 푸시 알림 핸들러: [lib/firebase/pushNotification.ts](file:///c:/dev/sokna/lib/firebase/pushNotification.ts)
