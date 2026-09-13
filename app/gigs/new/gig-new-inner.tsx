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
import { ArrowLeft, ShieldAlert } from "lucide-react";

export async function GigNewInner() {
  if (!hasEnvVars) {
    return (
      <div className="p-6 border border-destructive/20 rounded-2xl bg-destructive/10 text-destructive text-sm">
        Supabase 환경 변수를 설정한 뒤 이용할 수 있습니다.
      </div>
    );
  }

  const isAdmin = await getIsAdmin();

  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-6 w-full max-w-lg mx-auto py-12">
        <Card className="border-border/60 shadow-md">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto size-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-2">
              <ShieldAlert className="size-6" />
            </div>
            <CardTitle className="text-xl">접근 제한</CardTitle>
            <CardDescription className="text-sm">
              공연 추가 및 관리는 관리자 권한이 필요합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center gap-3 pt-2">
            <Button asChild variant="outline">
              <Link href="/gigs">공연 목록으로</Link>
            </Button>
            <Button asChild>
              <Link href="/auth/login">로그인</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full pb-16">
      <GigCreateForm />
    </div>
  );
}
