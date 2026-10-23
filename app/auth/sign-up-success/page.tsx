import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Clock } from "lucide-react";
import { PositiveStatusIcon as CheckCircle2 } from "@/components/ui/status-icons";
import { getLoginDestination } from "@/lib/auth/login-flow";

export default async function Page({ searchParams }: {
  searchParams: Promise<{ type?: string; redirect?: string }>;
}) {
  const params = await searchParams;
  const isMember = params.type === "member";
  const next = getLoginDestination(typeof params.redirect === "string" ? params.redirect : null, "https://sokna.local");
  const continueHref = `/auth/login?${new URLSearchParams({ onboarding: "membership", redirect: next })}`;
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-md">
        <Card className="border-border/60 shadow-lg text-center">
          <CardHeader className="space-y-3 pb-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">
              {isMember ? "회원 권한 요청이 완료되었습니다" : "이메일을 확인해 주세요"}
            </CardTitle>
            <CardDescription className="text-sm">
              {isMember ? "운영진 승인 후 동아리 회원 기능을 이용할 수 있습니다." : "이메일 인증을 마친 뒤 두 번째 단계에서 회원 권한을 요청하거나 건너뛸 수 있습니다."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {isMember && <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-4 text-left space-y-2">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-semibold text-sm">
                <Clock className="w-4 h-4" />
                <span>관리자 승인 대기 안내</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                부원의 개인정보 및 명부 보호를 위해 <strong>운영진의 승인 절차</strong>를 거쳐 정식 회원으로 등록됩니다.
                로그인은 바로 가능하며, 관리자가 신청 내역을 승인하면 동아리 회원 기능을 이용할 수 있습니다.
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed pt-1 border-t border-amber-500/10">
                ※ 이메일 인증 메일이 발송된 경우 메일함(스팸함 포함)의 확인 링크를 먼저 클릭해 주세요.
              </p>
            </div>}

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button asChild variant="outline" className="flex-1">
                <Link href="/">홈으로 이동</Link>
              </Button>
              <Button asChild className="flex-1">
                <Link href={isMember ? "/profile" : continueHref}>{isMember ? "프로필로 이동" : "인증 후 계속하기"}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
