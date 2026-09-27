"use client";

import Link from "next/link";
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { Bell, CheckCheck, ChevronDown, Loader2, RefreshCw, X } from "lucide-react";
import {
  deleteAllNotificationsAction,
  deleteNotificationAction,
  listNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/notifications/actions";
import { createClient } from "@/lib/supabase/client";
import { CONFIRMED_LINK_NAVIGATION_EVENT, type ConfirmedLinkNavigation } from "@/lib/confirmed-navigation";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createNotificationInbox, safeNotificationLink } from "./notification-menu-state";

interface NotificationMenuProps {
  userId: string;
  initialUnreadCount: number | null;
}

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul",
});

function notificationTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dateFormatter.format(date);
}

export function NotificationMenu({ userId, initialUnreadCount }: NotificationMenuProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const [inbox] = useState(() => createNotificationInbox({
    list: listNotificationsAction,
    remove: deleteNotificationAction,
    removeAll: deleteAllNotificationsAction,
    markRead: markNotificationReadAction,
    markAllRead: markAllNotificationsReadAction,
  }, userId, initialUnreadCount));
  const state = useSyncExternalStore(inbox.subscribe, inbox.getSnapshot, inbox.getSnapshot);

  useEffect(() => {
    let active = true;
    let reconnecting: Promise<void> | null = null;
    inbox.setUser(userId, initialUnreadCount);
    void inbox.refresh();
    const refresh = () => {
      if (document.visibilityState === "visible") void inbox.refresh({ background: true });
    };
    const onOnline = () => {
      if (document.visibilityState !== "visible" || reconnecting) return;
      const request = inbox.refreshAfterReconnect(() => active);
      reconnecting = request;
      void request.finally(() => { if (reconnecting === request) reconnecting = null; });
    };
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    const onNotificationChanged = (event: MessageEvent) => {
      if (event.data?.type === "SOKNA_NOTIFICATIONS_CHANGED") void inbox.refresh({ invalidate: true });
    };
    const onConfirmedNavigation = (event: Event) => {
      const navigation = (event as CustomEvent<ConfirmedLinkNavigation>).detail;
      const id = navigation?.data?.notificationId;
      const owner = navigation?.data?.notificationUserId;
      if (typeof id !== "string" || owner !== userId || inbox.getSnapshot().userId !== owner) return;
      void inbox.markRead(id).then((ok) => {
        const latest = inbox.getSnapshot();
        if (!ok && latest.userId === owner && latest.mutationError) toast.error(latest.mutationError);
      });
    };
    const { data } = createClient().auth.onAuthStateChange((_event, session) => {
      if (inbox.setUser(session?.user.id ?? null)) {
        reconnecting = null;
        setOpen(false);
        void inbox.refresh();
      }
    });
    window.addEventListener("focus", refresh);
    window.addEventListener("online", onOnline);
    window.addEventListener(CONFIRMED_LINK_NAVIGATION_EVENT, onConfirmedNavigation);
    document.addEventListener("visibilitychange", onVisible);
    navigator.serviceWorker?.addEventListener("message", onNotificationChanged);
    return () => {
      active = false;
      data.subscription.unsubscribe();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", onOnline);
      window.removeEventListener(CONFIRMED_LINK_NAVIGATION_EVENT, onConfirmedNavigation);
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onNotificationChanged);
    };
  }, [inbox, userId, initialUnreadCount]);

  // A server header update and the auth subscription may arrive in either order.
  if (!state.userId || state.userId !== userId) return null;

  const count = state.unreadCount;
  const countLabel = count === null ? "읽지 않은 알림 확인 중" : `읽지 않은 알림 ${count}개`;
  const retryList = () => { void (state.errorKind === "more" ? inbox.loadMore() : inbox.refresh()); };

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (nextOpen) void inbox.refresh();
    }}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`알림, ${countLabel}`}
          className="relative flex size-8 shrink-0 items-center justify-center rounded-full border border-border/50 text-foreground transition-colors hover:border-border hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Bell className="size-4" aria-hidden="true" />
          {count !== null && count > 0 && (
            <span aria-hidden="true" className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground ring-2 ring-background">
              {count > 99 ? "99+" : count}
            </span>
          )}
          <span className="sr-only" aria-live="polite" aria-atomic="true">{countLabel}</span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        collisionPadding={12}
        aria-labelledby={titleId}
        className="w-[min(22rem,calc(100vw-1.5rem))] max-h-[min(32rem,var(--radix-dropdown-menu-content-available-height))] rounded-xl border-border/60 p-0 shadow-lg"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border/60 bg-popover px-3 py-2">
          <DropdownMenuLabel id={titleId} className="flex items-center gap-2 p-0 text-sm font-semibold">
            알림
            {state.loading && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="새로고침 중" />}
          </DropdownMenuLabel>
          <div className="flex shrink-0 items-center gap-0.5">
            <DropdownMenuItem
              disabled={!state.cutoff || !count || state.markingAll || state.deletingAll}
              onSelect={(event) => { event.preventDefault(); void inbox.markAllRead(); }}
              className="cursor-pointer gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground focus:text-foreground"
            >
              {state.markingAll ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : <CheckCheck className="size-3" aria-hidden="true" />}
              모두 읽음
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!state.cutoff || (!state.items.length && !state.nextCursor) || state.markingAll || state.deletingAll || state.deletingId !== null}
              onSelect={(event) => { event.preventDefault(); void inbox.removeAll(); }}
              className="cursor-pointer gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground focus:bg-destructive/10 focus:text-destructive"
            >
              {state.deletingAll ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : <X className="size-3" aria-hidden="true" />}
              모두 삭제
            </DropdownMenuItem>
          </div>
        </div>

        {state.mutationError && (state.mutationKind === "all" || state.mutationKind === "deleteAll") && (
          <div className="border-b border-border/60 bg-destructive/5 px-3 py-2">
            <p role="alert" className="text-xs text-destructive">{state.mutationError}</p>
            <DropdownMenuItem onSelect={(event) => {
              event.preventDefault();
              void (state.mutationKind === "deleteAll" ? inbox.removeAll() : inbox.markAllRead());
            }} className="mt-1 w-fit cursor-pointer text-xs">
              <RefreshCw className="size-3" aria-hidden="true" /> {state.mutationKind === "deleteAll" ? "모두 삭제 다시 시도" : "모두 읽음 다시 시도"}
            </DropdownMenuItem>
          </div>
        )}

        {state.items.length === 0 && state.loading ? (
          <p role="status" className="px-4 py-10 text-center text-xs text-muted-foreground">알림을 불러오는 중입니다.</p>
        ) : state.items.length === 0 && !state.error && !state.nextCursor ? (
          <div role="status" className="flex flex-col items-center gap-2 px-4 py-10 text-center text-muted-foreground">
            <Bell className="size-6 opacity-50" aria-hidden="true" />
            <p className="text-xs">아직 도착한 알림이 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-1 p-1" aria-busy={state.loading}>
            {state.items.map((notification) => (
              <div key={notification.id} className={cn(
                "flex items-start rounded-lg",
                !notification.read_at && "bg-sky-50 dark:bg-sky-950/40",
              )}>
                <DropdownMenuItem
                  asChild
                  disabled={state.deletingAll}
                  textValue={notification.title ?? "알림"}
                  className={cn(
                    "min-w-0 flex-1 scroll-mt-12 cursor-pointer items-start gap-2.5 rounded-lg px-3 py-3",
                    !notification.read_at && "focus:bg-sky-100/70 dark:focus:bg-sky-900/40",
                  )}
                >
                  <Link
                    href={safeNotificationLink(notification.link)}
                    prefetch={false}
                    data-notification-id={notification.id}
                    data-notification-user-id={state.userId}
                    onClick={() => {
                      if (!notification.read_at) {
                        void inbox.markRead(notification.id).then((ok) => {
                          const latest = inbox.getSnapshot();
                          if (!ok && latest.userId === userId && latest.mutationError) toast.error(latest.mutationError);
                        });
                      }
                    }}
                  >
                    <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", notification.read_at ? "bg-transparent" : "bg-sky-600 dark:bg-sky-400")}>
                      {!notification.read_at && <span className="sr-only">읽지 않음: </span>}
                    </span>
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className={cn("block break-words text-xs leading-relaxed", notification.read_at ? "font-medium text-foreground/80" : "font-semibold text-sky-900 dark:text-sky-100")}>
                        {notification.title || "새 알림"}
                      </span>
                      {notification.body && <span className="block break-words text-xs leading-relaxed text-muted-foreground">{notification.body}</span>}
                      <time dateTime={notification.created_at} className="block text-[10px] text-muted-foreground/80">
                        {notificationTime(notification.created_at)}
                      </time>
                    </span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  asChild
                  disabled={state.deletingAll || state.deletingId === notification.id}
                  textValue={`${notification.title || "새 알림"} 삭제`}
                  onSelect={(event) => {
                    event.preventDefault();
                    void inbox.remove(notification.id).then((ok) => {
                      const latest = inbox.getSnapshot();
                      if (!ok && latest.userId === userId && latest.mutationError) toast.error(latest.mutationError);
                    });
                  }}
                  className="mr-1 mt-2 size-10 shrink-0 cursor-pointer justify-center rounded-md p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive sm:size-8"
                >
                  <button
                    type="button"
                    disabled={state.deletingAll || state.deletingId === notification.id}
                    aria-label={`${notification.title || "새 알림"} 삭제`}
                    title="알림 삭제"
                  >
                    {state.deletingId === notification.id
                      ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                      : <X className="size-3.5" aria-hidden="true" />}
                  </button>
                </DropdownMenuItem>
              </div>
            ))}
          </div>
        )}

        {state.error && (
          <div className="border-t border-border/60 px-3 py-3">
            <p role="alert" className="text-xs leading-relaxed text-destructive">{state.error}</p>
            <DropdownMenuItem onSelect={(event) => { event.preventDefault(); retryList(); }} className="mt-2 w-fit cursor-pointer text-xs">
              <RefreshCw className="size-3" aria-hidden="true" /> 다시 시도
            </DropdownMenuItem>
          </div>
        )}

        {state.nextCursor && !state.error && (
          <div className="border-t border-border/60 p-1">
            <DropdownMenuItem
              disabled={state.loading || state.loadingMore}
              onSelect={(event) => { event.preventDefault(); void inbox.loadMore(); }}
              className="justify-center gap-1.5 rounded-lg py-2.5 text-xs text-muted-foreground"
            >
              {state.loadingMore ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <ChevronDown className="size-3.5" aria-hidden="true" />}
              {state.loadingMore ? "불러오는 중" : "이전 알림 더 보기"}
            </DropdownMenuItem>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
