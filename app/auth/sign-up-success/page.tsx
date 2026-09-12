import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Clock, CheckCircle2 } from "lucide-react";

export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-md">
        <Card className="border-border/60 shadow-lg text-center">
          <CardHeader className="space-y-3 pb-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">
              가입 신청이 완료되었습니다
            </CardTitle>
            <CardDescription className="text-sm">
              소크나 부원 가입 신청이 정상적으로 접수되었습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-4 text-left space-y-2">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-semibold text-sm">
                <Clock className="w-4 h-4" />
                <span>관리자 승인 대기 안내</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                부원의 개인정보 및 명부 보호를 위해 <strong>운영진의 승인 절차</strong>를 거쳐 정식 회원으로 등록됩니다.
                관리자가 신청 내역(기수, 실명, 세션)을 확인한 후 승인하면 정상적으로 로그인하여 활동하실 수 있습니다.
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed pt-1 border-t border-amber-500/10">
                ※ 이메일 인증 메일이 발송된 경우 메일함(스팸함 포함)의 확인 링크를 먼저 클릭해 주세요.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button asChild variant="outline" className="flex-1">
                <Link href="/">홈으로 이동</Link>
              </Button>
              <Button asChild className="flex-1">
                <Link href="/auth/login">로그인 화면으로</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
