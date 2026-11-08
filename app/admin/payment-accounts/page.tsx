import { Landmark } from "lucide-react";
import { AdminPageHeading } from "@/components/admin/admin-page-heading";
import { PaymentAccountForm } from "@/components/tickets/payment-account-form";
import { ticketClient, ticketDatabaseError } from "@/lib/ticket-server";
import { ticketDateTime } from "@/lib/ticket-reservations";
import { cn } from "@/lib/utils";

export const metadata = { title: "납부 계좌 설정", robots: { index: false, follow: false } };

export default async function PaymentAccountsPage() {
  const { data: accounts, error } = await (
    await ticketClient()
  )
    .from("payment_accounts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  const active = accounts?.find((a) => a.active) ?? null;

  return (
    <div className="w-full max-w-2xl space-y-6">
      <AdminPageHeading
        title="납부 계좌 설정"
        description="유료 예매 신청 직후 관객에게 안내하고 복사할 수 있도록 표시할 입금 계좌를 설정합니다."
      />
      {error ? (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {ticketDatabaseError(error)}
        </p>
      ) : (
        <>
          <PaymentAccountForm key={active?.id ?? "new"} current={active} />
          {!!accounts?.length && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">계좌 설정 이력</h2>
              {accounts.map((a) => (
                <div
                  key={a.id}
                  className={cn(
                    "space-y-1.5 rounded-xl border p-4 text-sm transition-colors",
                    a.active
                      ? "border-emerald-500/35 bg-emerald-500/5"
                      : "border-border/70 bg-card",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="inline-flex items-center gap-1.5 break-all font-semibold">
                      <Landmark className="size-4 shrink-0 text-primary" aria-hidden="true" />
                      {a.bank} {a.account_number} · 예금주 {a.holder}
                    </p>
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                        a.active
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : "border-border/70 bg-muted text-muted-foreground",
                      )}
                    >
                      {a.active ? "현재 적용 중" : "이전 계좌"}
                    </span>
                  </div>
                  {a.instruction && (
                    <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
                      {a.instruction}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">등록 일시: {ticketDateTime(a.created_at)}</p>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
