import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoutButton } from "@/components/logout-button";

export function AudienceAccount({ email }: { email?: string }) {
  return (
    <div className="mx-auto w-full max-w-lg space-y-5 py-6">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">내 계정</CardTitle>
          <CardDescription>동아리 가입 없이 공연 정보를 확인할 수 있는 계정입니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {email && <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground">로그인 이메일</p>
            <p className="break-all text-sm">{email}</p>
          </div>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button asChild size="sm"><Link href="/gigs">공연 보러 가기</Link></Button>
            <LogoutButton />
          </div>
        </CardContent>
      </Card>
      <div className="rounded-xl border border-border/60 p-4 text-sm">
        <p className="font-semibold">소리로 크는 나무 회원이신가요?</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">언제든지 회원 권한을 요청할 수 있습니다. 운영진 승인 후 동아리 활동에 참여할 수 있습니다.</p>
        <Button asChild variant="outline" size="sm" className="mt-3">
          <Link href="/auth/complete-profile">회원 권한 요청</Link>
        </Button>
      </div>
    </div>
  );
}
