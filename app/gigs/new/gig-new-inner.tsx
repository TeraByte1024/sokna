import Link from "next/link";
import { GigCreateForm } from "@/components/gigs/gig-create-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getIsAdmin } from "@/lib/auth-admin";
import { hasEnvVars } from "@/lib/utils";

export async function GigNewInner() {
  if (!hasEnvVars) {
    return (
      <p className="text-sm text-muted-foreground">
        Supabase 환경 변수를 설정한 뒤 이용할 수 있습니다.
      </p>
    );
  }

  const isAdmin = await getIsAdmin();

  if (!isAdmin) {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>접근 제한</CardTitle>
          <CardDescription>
            공연 추가는 관리자 권한이 필요합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/auth/login">로그인</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/gigs">목록으로</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-8 w-full max-w-2xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          공연 추가
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          새로운 공연을 추가합니다.
        </p>
      </div>
      <GigCreateForm />
    </div>
  );
}
