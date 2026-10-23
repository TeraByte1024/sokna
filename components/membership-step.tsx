import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function MembershipStep({ next }: { next: string }) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="space-y-2">
        <p className="text-xs text-muted-foreground">2단계 · 회원 권한</p>
        <CardTitle className="break-keep text-lg font-bold">소리로 크는 나무 회원이신가요?</CardTitle>
        <CardDescription className="break-keep text-xs leading-relaxed">
          회원 권한을 요청하면 운영진 승인 후 동아리 활동에 참여할 수 있습니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button asChild className="w-full">
          <Link href="/auth/complete-profile">회원 권한 요청</Link>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link href={next}>나중에 할게요</Link>
        </Button>
        <p className="break-keep pt-1 text-center text-xs leading-relaxed text-muted-foreground">
          나중에 프로필에서도 회원 권한을 요청할 수 있습니다.
        </p>
      </CardContent>
    </Card>
  );
}
