"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
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
}

export function UserProfileMenu({ userName, userEmail }: UserProfileMenuProps) {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  };

  return (
    <DropdownMenu>
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

      <DropdownMenuContent align="end" className="w-44 mt-1.5 shadow-lg border-border/60">
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
  );
}
