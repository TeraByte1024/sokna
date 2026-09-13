import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Suspense fallback={<div className="h-64 flex items-center justify-center text-sm text-muted-foreground">로딩 중…</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
