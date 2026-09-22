# 웹 푸시 즉시 알림 통합 테스트 기록 (2026-09-22)

## 1. 테스트 범위

- 로컬 FCM 발송 및 cron 처리
- 신규 가입 승인 요청 관리자 푸시
- 선곡회의 후보곡 등록 참여자 푸시와 등록자 제외
- 마케팅 미동의 계정 발송 차단
- 허용 공연자: `terabyte4096@gmail.com`, `1024terrabyte@gmail.com`
- 가입 테스트 계정: `var256@hanyang.ac.kr`
- 테스트 데이터 유지

## 2. 사전조건 결과

| 항목 | 결과 | 증적 |
| :--- | :--- | :--- |
| DB 마이그레이션 | 통과 | `20260922010000_enable_web_push_delivery.sql` 원격 적용 |
| 타입/빌드 | 통과 | `npm run types`, `tsc --noEmit`, `npm run build` 성공 |
| cron 인증 | 통과 | Bearer `CRON_SECRET` 요청 200 |
| 외부 cron 라우팅 | 수정 후 통과 | `/api/cron/*` 로그인 리다이렉트 제외, 라우트 Bearer 검증 유지 |
| Supabase 새 secret key | 수정 후 통과 | `.env.local` 오입력 수정 후 REST 200 |
| Supabase legacy service role | 통과 | 새 secret 수정 전 진단 과정에서 동일 프로젝트 REST 200 확인 |
| cron 접근 제어 | 통과 | 인증 없음 401, 올바른 Bearer 요청 200 |

## 3. 실행 결과

### 3.1 FCM 사전 발송

- 대상: `terabyte4096@gmail.com` (마케팅 동의, 등록 토큰 2개)
- 알림 ID: `25db8e97-fe60-42f2-a8f4-7cd99cd10a80`
- 제목: `[LOCAL PUSH TEST - PRECHECK]`
- 결과: `push_status = sent`, FCM 성공 1건
- 만료 토큰 1개 자동 삭제, 유효 토큰 1개 유지
- 사용자 화면 수신 확인: **통과** — Windows 시스템 알림에 제목, 본문, `localhost:3000` origin 표시 확인
- 로컬 백그라운드 푸시 smoke test 판정: **통과**

#### 수정된 Supabase secret key 재검증

- 알림 ID: `a03b4404-7e13-40a6-8f28-0b8f8eb99077`
- 제목: `[LOCAL PUSH TEST - NEW SECRET]`
- 수정된 `.env.local`의 `SUPABASE_SECRET_KEY`만 사용
- cron: pending push 1건 처리, FCM 성공 1건
- 최종 상태: `sent`, 오류 없음
- 사용자 화면 수신 확인: 대기

### 3.2 마케팅 미동의 음성 테스트

- 공연 ID: `6`
- 공연명: `[PUSH TEST] 즉시 알림 E2E 2026-09-22`
- 참여자: 허용된 두 계정만 총 2명
- 후보곡 ID: `101`
- 큐 ID: `3`
- 등록자: `terabyte4096@gmail.com`
- 수신 검증 계정: `1024terrabyte@gmail.com`
- 검증 중 수신 동의: 일시적으로 `false`, 완료 후 기존 `true`로 복원
- cron: 처리 큐 1건, FCM 발송 0건
- 수신 계정 `notifications`: 0건
- 큐 최종 상태: `sent`
- 판정: **통과**

### 3.3 부수적으로 처리된 기존 큐

- 첫 cron 호출 시 기존 만료 큐 ID `2`가 함께 처리됨
- 공연 ID `2`, FCM 발송 0건, 최종 상태 `sent`

## 4. 남은 검증

- `1024terrabyte@gmail.com`의 localhost 토큰 등록 후 직접 smoke push 수신
- 운영 도메인에서 관리자 및 두 공연자 토큰 등록
- `var256@hanyang.ac.kr` 실제 가입 후 관리자 푸시 수신 및 `/admin/members` 이동
- gig 6에서 실제 등록 액션으로 후보곡 추가 후 큐만 만료하여 데스크톱/모바일 수신 확인
- 등록자 제외 및 운영 링크 클릭 확인

> FCM 토큰, API 키, 비밀번호는 본 문서와 로그 증적에 기록하지 않습니다.

## 5. 후보곡 즉시 발송 재검증 (2026-09-23)

- 기존 15분 디바운스를 임시 비활성화하고 `scheduled_at = now()`로 변경했습니다.
- 후보곡 등록 액션이 큐 처리를 백그라운드 Promise로 남기지 않고, 새로 생성된 정확한 큐 ID의 처리를 `await`하도록 변경했습니다.
- 테스트 공연 ID `6`, 기존 후보곡 ID `101`, 등록자 `terabyte4096@gmail.com`, 수신자 `1024terrabyte@gmail.com` 범위에서 검증했습니다.
- 검증 큐 ID `4`: `pending`에서 `sent`로 전이했습니다.
- FCM 성공: 등록된 수신 기기 2대에 2건 전송했습니다.
- 알림 로그: `push_status = sent`, `push_error = null`을 확인했습니다.
- 임시 검증 API와 인증 프록시 예외는 테스트 직후 제거했으며 테스트 큐와 알림 증적은 유지합니다.
