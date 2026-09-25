"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { requestNotificationPermission } from "@/lib/firebase/push-permission";
import {
	enableMarketingOptInAction,
	registerPushTokenAction,
	unregisterPushTokenAction,
} from "@/app/profile/notification-actions";

const TOKEN_STORAGE_KEY = "sokna-fcm-token";
const TOKEN_CHANGE_EVENT = "sokna-push-token-change";

export function usePushNotificationDevice(initialMarketingOptIn: boolean, enabled = true) {
	const router = useRouter();
	const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
	const [hasRegisteredToken, setHasRegisteredToken] = useState(false);
	const [hasMarketingConsent, setHasMarketingConsent] = useState(initialMarketingOptIn);
	const [isPending, setIsPending] = useState(false);

	useEffect(() => {
		setHasMarketingConsent(initialMarketingOptIn);
	}, [initialMarketingOptIn]);

	useEffect(() => {
		if (!enabled) return;
		let active = true;
		const syncTokenState = async () => {
			const { isPushNotificationSupported } = await import("@/lib/firebase/pushNotification");
			const supported = await isPushNotificationSupported();
			if (!active) return;
			if (!supported) {
				setPermission("unsupported");
				setHasRegisteredToken(false);
				return;
			}
			setPermission(Notification.permission);
			try {
				setHasRegisteredToken(Boolean(window.localStorage.getItem(TOKEN_STORAGE_KEY)));
			} catch {
				setHasRegisteredToken(false);
			}
		};
		const onTokenChange = () => { void syncTokenState(); };
		void syncTokenState();
		window.addEventListener(TOKEN_CHANGE_EVENT, onTokenChange);
		return () => {
			active = false;
			window.removeEventListener(TOKEN_CHANGE_EVENT, onTokenChange);
		};
	}, [enabled]);

	const registerDevice = async () => {
		const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
		await navigator.serviceWorker.ready;
		const { getFcmToken } = await import("@/lib/firebase/pushNotification");
		const tokenResult = await getFcmToken(registration);
		if (!tokenResult.data) throw new Error(tokenResult.error ?? "토큰 발급 실패");
		const result = await registerPushTokenAction(tokenResult.data, navigator.userAgent);
		if (!result.ok) throw new Error(result.error);
		window.localStorage.setItem(TOKEN_STORAGE_KEY, tokenResult.data);
		setPermission(Notification.permission);
		setHasRegisteredToken(true);
		window.dispatchEvent(new Event(TOKEN_CHANGE_EVENT));
	};

	const enablePush = async () => {
		if (isPending) return false;
		setIsPending(true);
		try {
			const permissionResult = await requestNotificationPermission();
			if (permissionResult.error) throw new Error(permissionResult.error);
			await registerDevice();
			toast.success("이 기기에서 푸시 알림을 받습니다.");
			return true;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "푸시 알림 설정에 실패했습니다.");
			return false;
		} finally {
			setIsPending(false);
		}
	};

	const consentAndEnablePush = async () => {
		if (isPending) return false;
		setIsPending(true);
		try {
			const permissionResult = await requestNotificationPermission();
			if (permissionResult.error) throw new Error(permissionResult.error);
			const consentResult = await enableMarketingOptInAction();
			if (!consentResult.ok) throw new Error(consentResult.error);
			setHasMarketingConsent(true);
			await registerDevice();
			toast.success("수신 동의와 이 기기 알림 설정이 완료되었습니다.");
			router.refresh();
			return true;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "푸시 알림 설정에 실패했습니다.");
			return false;
		} finally {
			setIsPending(false);
		}
	};

	const disablePush = async () => {
		if (isPending) return false;
		setIsPending(true);
		try {
			const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
			if (token) {
				const result = await unregisterPushTokenAction(token);
				if (!result.ok) throw new Error(result.error);
			}
			const { deleteFcmToken } = await import("@/lib/firebase/pushNotification");
			await deleteFcmToken().catch(() => undefined);
			window.localStorage.removeItem(TOKEN_STORAGE_KEY);
			setHasRegisteredToken(false);
			window.dispatchEvent(new Event(TOKEN_CHANGE_EVENT));
			toast.success("이 기기의 푸시 알림을 해제했습니다.");
			return true;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "푸시 알림 해제에 실패했습니다.");
			return false;
		} finally {
			setIsPending(false);
		}
	};

	return {
		permission,
		enabled: hasMarketingConsent && permission === "granted" && hasRegisteredToken,
		hasRegisteredToken,
		hasMarketingConsent,
		isPending,
		enablePush,
		consentAndEnablePush,
		disablePush,
	};
}

export function MarketingPushConsentDialog({
	isOpen,
	isPending,
	onClose,
	onConfirm,
}: {
	isOpen: boolean;
	isPending: boolean;
	onClose: () => void;
	onConfirm: () => void;
}) {
	useEffect(() => {
		if (!isOpen) return;
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape" && !isPending) onClose();
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, isPending, onClose]);

	if (!isOpen) return null;

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="push-consent-title"
			className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
			onClick={() => !isPending && onClose()}
		>
			<div
				className="w-full max-w-md space-y-5 rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-200"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="flex items-start gap-3.5">
					<div className="shrink-0 rounded-xl bg-primary/10 p-3 text-primary">
						<BellRing className="size-6" />
					</div>
					<div className="min-w-0 flex-1 space-y-1.5">
						<h3 id="push-consent-title" className="text-base font-bold text-foreground">
							알림 수신에 동의하시겠습니까?
						</h3>
						<p className="text-xs leading-relaxed text-muted-foreground">
							동아리 공연, 행사, 가입 승인 및 선곡회의 소식을 앱 푸시로 받습니다. 동의 여부는 프로필에서 언제든 변경할 수 있습니다.
						</p>
					</div>
				</div>

				<div className="flex items-center justify-end gap-2.5 border-t border-border/60 pt-4">
					<Button type="button" variant="outline" size="sm" disabled={isPending} onClick={onClose}>
						취소
					</Button>
					<Button type="button" size="sm" disabled={isPending} onClick={onConfirm}>
						{isPending && <Loader2 className="animate-spin" />}
						동의하고 알림 켜기
					</Button>
				</div>
			</div>
		</div>
	);
}
