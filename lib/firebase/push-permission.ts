export async function requestNotificationPermission() {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return { data: null, error: "이 브라우저는 FCM을 지원하지 않습니다." };
  }

  try {
    // 권한 요청은 사용자 탭 동작 안에서 시작해야 합니다.
    const permission = await Notification.requestPermission();
    return permission === "granted"
      ? { data: permission, error: null }
      : { data: null, error: "브라우저 알림 권한이 허용되지 않았습니다." };
  } catch {
    return { data: null, error: "브라우저 알림 권한을 요청하지 못했습니다." };
  }
}
