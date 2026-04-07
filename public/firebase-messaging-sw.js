/**
 * Service Worker는 웹 페이지와 별도의 실행 컨텍스트(Service Worker 실행 컨텍스트)에서 동작
 * 'window' 대신 'self'를 사용:
 */

// ['Service Worker 설치' 시 실행]
// 브라우저가 Service Worker를 처음 감지했을 때 발생
self.addEventListener("install", function () {
	console.log("fcm sw install..");
	self.skipWaiting(); // 기존 Service Worker가 있더라도 즉시 활성화하도록 함
});

// ['Service Worker 활성화' 시 실행]
// install 이벤트 후에 발생하며, 이 시점에서 Service Worker가 제어권을 가짐
self.addEventListener("activate", function () {
	console.log("fcm sw activate..");
});

// ['푸쉬 알림 도착' 시 실행]
// Firebase Cloud Messaging에서 보낸 메시지를 처리
self.addEventListener("push", function (e) {
	// 푸시 메시지 데이터를 JSON 형식으로 로그 출력
	console.log("push: ", e.data.json());

	// 데이터가 없으면 함수 종료
	if (!e.data.json()) {
		return;
	}

	// 알림 정보 추출
	const { title, body, image, tag } = e.data.json().notification;

	// 알림 옵션 설정 (제목, 본문, 아이콘, 태그 등)
	const notificationOptions = {
		body: body,
		icon: image,
		tag: tag,
	};

	// 알림 실행
	self.registration.showNotification(title, notificationOptions);
});

// ['푸쉬 알림 클릭 시 실행]
self.addEventListener("notificationclick", function (event) {
	console.log("notification click");
	// 클릭 시 열릴 URL 설정
	const url = "/";
	// 알림 닫기
	event.notification.close();
	// 지정된 URL로 새 창 또는 탭 열기
	// waitUntil은 비동기 작업이 완료될 때까지 Service Worker를 활성 상태로 유지합니다. 즉, 이 코드에서는 지정된 URL로 탭 열 때까지 Service worker가 활성 상태로 유지됩니다.
	event.waitUntil(clients.openWindow(url));
});
