"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, BellOff, Loader2, User, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  MarketingPushConsentDialog,
  usePushNotificationDevice,
} from "@/components/push-notification-settings";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface UserProfileMenuProps {
  userName: string | null;
  userEmail?: string;
  marketingOptIn: boolean;
}

export function UserProfileMenu({ userName, userEmail, marketingOptIn }: UserProfileMenuProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [consentDialogOpen, setConsentDialogOpen] = useState(false);
  const push = usePushNotificationDevice(marketingOptIn);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  };

  return (
    <>
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="내 계정 프로필 메뉴"
          className="flex items-center gap-1.5 rounded-full p-1.5 sm:px-2.5 sm:py-1 text-xs sm:text-sm font-medium hover:bg-accent text-foreground transition-colors border border-border/50 hover:border-border shrink-0 outline-none"
        >
          <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <User className="w-3.5 h-3.5" />
          </div>
          {userName && (
            <span className="hidden sm:inline font-semibold max-w-[110px] truncate">
              {userName}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56 mt-1.5 shadow-lg border-border/60">
        {(userName || userEmail) && (
          <>
            <div className="px-2.5 py-1.5 text-xs">
              <p className="font-semibold truncate text-foreground">
                {userName ? `${userName} 님` : "회원"}
              </p>
              {userEmail && (
                <p className="text-[11px] text-muted-foreground truncate">
                  {userEmail}
                </p>
              )}
            </div>
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuItem asChild>
          <Link
            href="/profile"
            className="flex items-center gap-2 cursor-pointer font-medium text-xs sm:text-sm py-2 w-full"
          >
            <User className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>내 정보</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem
          disabled={push.isPending || push.permission === "unsupported" || push.permission === "denied"}
          onSelect={(event) => {
            event.preventDefault();
            if (push.enabled) {
              void push.disablePush();
              return;
            }
            if (!push.hasMarketingConsent) {
              setMenuOpen(false);
              setConsentDialogOpen(true);
              return;
            }
            void push.enablePush();
          }}
          className="cursor-pointer py-2"
        >
          {push.isPending ? (
            <Loader2 className="animate-spin text-muted-foreground" />
          ) : push.enabled ? (
            <Bell className="text-primary" />
          ) : (
            <BellOff className="text-muted-foreground" />
          )}
          <span className="whitespace-nowrap font-medium text-xs sm:text-sm">이 기기에서 알림 받기</span>
          <span
            aria-hidden="true"
            className={cn(
              "ml-auto relative h-5 w-9 shrink-0 rounded-full transition-colors",
              push.enabled ? "bg-primary" : "bg-muted-foreground/30",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-4 w-4 rounded-full bg-background shadow-sm transition-transform",
                push.enabled ? "translate-x-[18px]" : "translate-x-0.5",
              )}
            />
          </span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={handleLogout}
          className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10 font-medium text-xs sm:text-sm py-2 w-full"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>로그아웃</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <MarketingPushConsentDialog
      isOpen={consentDialogOpen}
      isPending={push.isPending}
      onClose={() => setConsentDialogOpen(false)}
      onConfirm={() => {
        void push.consentAndEnablePush().then((ok) => {
          if (ok) setConsentDialogOpen(false);
        });
      }}
    />
    </>
  );
}
