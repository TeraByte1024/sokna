"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { updateMyProfileAction } from "./actions";
import { toast } from "@/components/ui/sonner";
import { LeaveConfirmDialog, useUnsavedChangesWarning } from "@/components/ui/leave-confirm-dialog";
import {
  MarketingPushConsentDialog,
  usePushNotificationDevice,
} from "@/components/push-notification-settings";
import { cn } from "@/lib/utils";
import {
  User,
  Mail,
  Sparkles,
  ShieldCheck,
  Crown,
  Clock,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Bell,
} from "lucide-react";

const SESSION_PRESETS = [
  "보컬",
  "기타",
  "베이스",
  "드럼",
  "건반",
  "창작",
  "직접 입력",
] as const;

export interface ProfileUser {
  id: string;
  email: string | null;
  name: string;
  generation: number | null;
  part: string | null;
  status: string;
  applied_at: string;
  approved_at: string | null;
  marketing_opt_in: boolean;
  marketing_opted_in_label: string | null;
}

interface ProfileFormProps {
  user: ProfileUser;
  isAdmin: boolean;
}

export function ProfileForm({ user, isAdmin }: ProfileFormProps) {
  const router = useRouter();
  const [name, setName] = useState(user.name || "");
  const [generation, setGeneration] = useState(
    user.generation ? String(user.generation) : ""
  );

  const initialPart = user.part?.trim() || "";
  const isInitialPreset = (SESSION_PRESETS.slice(0, 6) as readonly string[]).includes(
    initialPart
  );

  const [selectedPreset, setSelectedPreset] = useState<string>(
    initialPart ? (isInitialPreset ? initialPart : "직접 입력") : ""
  );
  const [customPart, setCustomPart] = useState<string>(
    initialPart && !isInitialPreset ? initialPart : ""
  );
  const [marketingOptIn, setMarketingOptIn] = useState<boolean>(
    user.marketing_opt_in ?? false
  );
  const [pushConsentDialogOpen, setPushConsentDialogOpen] = useState(false);
  const push = usePushNotificationDevice(user.marketing_opt_in);

  useEffect(() => {
    setMarketingOptIn(user.marketing_opt_in ?? false);
  }, [user.marketing_opt_in]);

  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const currentPart = selectedPreset === "직접 입력" ? customPart.trim() : selectedPreset;

  const isDirty =
    name.trim() !== (user.name || "") ||
    generation.trim() !== (user.generation ? String(user.generation) : "") ||
    currentPart !== initialPart ||
    marketingOptIn !== (user.marketing_opt_in ?? false);

  const {
    showLeaveModal,
    cancelLeave,
    confirmLeave,
    markSubmitting,
  } = useUnsavedChangesWarning({ isDirty });

  const handlePresetSelect = (preset: string) => {
    if (selectedPreset === preset) {
      // 이미 선택된 항목 재클릭 시 선택 해제
      setSelectedPreset("");
      setCustomPart("");
    } else {
      setSelectedPreset(preset);
      if (preset !== "직접 입력") {
        setCustomPart("");
      }
    }
  };

  const handleClearSession = () => {
    setSelectedPreset("");
    setCustomPart("");
  };

  const handleDevicePushToggle = () => {
    if (push.enabled) {
      void push.disablePush();
    } else if (!push.hasMarketingConsent) {
      setPushConsentDialogOpen(true);
    } else {
      void push.enablePush();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("이름(실명)을 입력해 주세요.");
      setMessage({ type: "error", text: "이름(실명)을 입력해 주세요." });
      return;
    }

    const genNum = parseInt(generation, 10);
    if (isNaN(genNum) || genNum < 1) {
      toast.error("올바른 기수를 입력해 주세요. (1 이상의 숫자)");
      setMessage({
        type: "error",
        text: "올바른 기수를 입력해 주세요. (1 이상의 숫자)",
      });
      return;
    }

    let finalPart: string | null = null;
    if (selectedPreset === "직접 입력") {
      finalPart = customPart.trim() || null;
    } else if (selectedPreset) {
      finalPart = selectedPreset;
    }

    startTransition(async () => {
      const res = await updateMyProfileAction(
        trimmedName,
        genNum,
        finalPart,
        marketingOptIn
      );

      if (res.ok) {
        markSubmitting();
        if (user.marketing_opt_in && !marketingOptIn && push.hasRegisteredToken) {
          await push.disablePush();
        }
        router.refresh();
        toast.success(res.message || "회원 정보가 성공적으로 수정되었습니다.");
        setMessage({
          type: "success",
          text: res.message || "회원 정보가 성공적으로 수정되었습니다.",
        });
      } else {
        toast.error(res.error || "수정에 실패했습니다.");
        setMessage({ type: "error", text: res.error || "수정에 실패했습니다." });
      }
    });
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return "-";
    const d = new Date(isoString);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
      d.getDate()
    ).padStart(2, "0")}`;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-16">
      {/* 1. 상단 프로필 요약 카드 */}
      <Card className="border-border/60 shadow-sm overflow-hidden bg-gradient-to-br from-card to-card/90">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
                <User className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold tracking-tight text-foreground">
                    {user.name || "회원"}
                  </h1>
                  {user.generation && (
                    <Badge variant="secondary" className="font-semibold text-xs px-2 py-0.5">
                      {user.generation}기
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground/70" />
                  <span>{user.email || "이메일 정보 없음"}</span>
                </div>
              </div>
            </div>

            {/* 승인 상태 뱃지 및 관리자 뱃지 */}
            <div className="flex flex-wrap sm:flex-col sm:items-end gap-1.5 self-stretch sm:self-auto justify-start">
              {/* 단일 상태 뱃지 (회원 / 승인 대기 중) */}
              {user.status === "approved" ? (
                <Badge
                  variant="outline"
                  className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-semibold text-xs py-1 px-2.5 gap-1"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  회원
                </Badge>
              ) : user.status === "pending" ? (
                <Badge
                  variant="outline"
                  className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 font-semibold text-xs py-1 px-2.5 gap-1"
                >
                  <Clock className="w-3.5 h-3.5" />
                  승인 대기 중
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-xs py-1 px-2.5">
                  가입 반려
                </Badge>
              )}

              {/* 관리자일 경우 관리자 뱃지 추가 표시 */}
              {isAdmin && (
                <Badge
                  variant="outline"
                  className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30 font-semibold text-xs py-1 px-2.5 gap-1"
                >
                  <Crown className="w-3.5 h-3.5 text-amber-500" />
                  관리자
                </Badge>
              )}
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-border/40 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-muted-foreground">
            <div>
              <span className="block text-[11px] text-muted-foreground/70">현재 담당 세션</span>
              <span className="font-medium text-foreground">
                {user.part || "세션 미지정"}
              </span>
            </div>
            <div>
              <span className="block text-[11px] text-muted-foreground/70">신청 일시</span>
              <span className="font-medium text-foreground">
                {formatDate(user.applied_at)}
              </span>
            </div>
            {user.approved_at && (
              <div>
                <span className="block text-[11px] text-muted-foreground/70">승인 일시</span>
                <span className="font-medium text-foreground">
                  {formatDate(user.approved_at)}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 2. 회원 정보 수정 폼 카드 */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            내 정보 수정
          </CardTitle>
          <CardDescription className="text-xs">
            동아리 활동 및 부원 명부에 반영되는 본인의 기본 정보를 수정할 수 있습니다.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form
            onSubmit={handleSubmit}
            className="space-y-5"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const target = e.target as HTMLElement | null;
                if (target && target.tagName === "INPUT") {
                  const input = target as HTMLInputElement;
                  if (!["button", "submit", "reset"].includes(input.type)) {
                    e.preventDefault();
                  }
                }
              }
            }}
          >
            {/* 알림 메시지 */}
            {message && (
              <div
                className={`p-3.5 rounded-lg text-xs font-medium flex items-center gap-2 border ${
                  message.type === "success"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                    : "bg-destructive/10 text-destructive border-destructive/20"
                }`}
              >
                {message.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{message.text}</span>
              </div>
            )}

            {/* 계정 이메일 (읽기 전용) */}
            <div className="space-y-1.5">
              <Label htmlFor="userEmail" className="text-xs text-muted-foreground">
                로그인 계정 이메일
              </Label>
              <Input
                id="userEmail"
                value={user.email || "이메일 정보 없음"}
                disabled
                className="bg-muted/40 text-muted-foreground text-xs font-mono h-9 cursor-not-allowed"
              />
              <p className="text-[11px] text-muted-foreground/80">
                ※ 로그인 계정 이메일은 보안상 직접 변경할 수 없습니다.
              </p>
            </div>

            {/* 이름(실명) */}
            <div className="space-y-1.5">
              <Label htmlFor="userName" className="text-xs font-semibold flex items-center gap-1">
                이름 (실명) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="userName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="본인의 실명을 입력해 주세요"
                className="h-10"
                required
              />
            </div>

            {/* 기수 */}
            <div className="space-y-1.5">
              <Label htmlFor="userGen" className="text-xs font-semibold flex items-center gap-1">
                기수 <span className="text-destructive">*</span>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="userGen"
                  type="number"
                  min="1"
                  value={generation}
                  onChange={(e) => setGeneration(e.target.value)}
                  placeholder="예: 40"
                  className="h-10 w-36"
                  required
                />
                <span className="text-sm font-medium text-muted-foreground">기</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                소크나 입부 기수를 1 이상의 숫자로 입력해 주세요.
              </p>
            </div>

            {/* 세션(파트) - 선택 사항 */}
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold flex items-center gap-1">
                  세션 (파트) <span className="text-xs font-normal text-muted-foreground">(선택 사항)</span>
                </Label>
                {selectedPreset && (
                  <button
                    type="button"
                    onClick={handleClearSession}
                    className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
                  >
                    선택 해제 (미지정)
                  </button>
                )}
              </div>

              {/* 세션 프리셋 뱃지 칩 */}
              <div className="flex flex-wrap gap-2">
                {SESSION_PRESETS.map((preset) => {
                  const isSelected = selectedPreset === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handlePresetSelect(preset)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary shadow-xs"
                          : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border/60"
                      }`}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>

              {/* 직접 입력 선택 시 노출 */}
              {selectedPreset === "직접 입력" && (
                <div className="pt-1">
                  <Input
                    value={customPart}
                    onChange={(e) => setCustomPart(e.target.value)}
                    placeholder="세션명을 직접 입력해 주세요 (예: 퍼커션, 신디사이저, 브라스 등)"
                    className="h-10 text-sm"
                    autoFocus
                  />
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                주로 담당하는 악기 또는 포지션을 선택해 주세요. 세션은 필수 입력 항목이 아닙니다.
              </p>
            </div>

            {/* 앱 푸시 알림 수신 동의 */}
            <div className="pt-3 border-t border-border/40">
              <div className="flex items-start space-x-2.5">
                <Checkbox
                  id="marketingOptIn"
                  checked={marketingOptIn}
                  onCheckedChange={(checked) => setMarketingOptIn(Boolean(checked))}
                  className="mt-0.5"
                />
                <div className="flex-1 space-y-1">
                  <Label
                    htmlFor="marketingOptIn"
                    className="text-xs font-semibold cursor-pointer"
                  >
                    앱 푸시 알림 수신 동의 (선택)
                  </Label>
                  <p className="text-[11px] font-medium text-muted-foreground">
                    {marketingOptIn
                      ? user.marketing_opt_in
                        ? user.marketing_opted_in_label
                          ? `${user.marketing_opted_in_label} 동의함`
                          : "동의함"
                        : "저장하면 동의 시각이 기록됩니다."
                      : user.marketing_opt_in
                        ? "저장하면 수신 동의가 해제됩니다."
                        : "미동의"}
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    소크나 공연, 행사, 가입 승인 및 선곡회의 소식을 앱 푸시로 받아봅니다. 아래 토글이나 헤더 프로필 메뉴에서 이 기기의 알림을 관리할 수 있습니다.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex min-h-12 items-center gap-3">
                <Bell aria-hidden="true" className="size-5 shrink-0 text-foreground" strokeWidth={1.8} />
                <span id="devicePushLabel" className="min-w-0 flex-1 text-sm font-semibold text-foreground">
                  이 기기에서 알림 받기
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={push.enabled}
                  aria-labelledby="devicePushLabel"
                  aria-describedby={push.permission === "unsupported" || push.permission === "denied" ? "devicePushDescription" : undefined}
                  title={push.enabled ? "이 기기 알림 끄기" : "이 기기 알림 켜기"}
                  disabled={isPending || push.isPending || push.permission === "unsupported" || push.permission === "denied"}
                  onClick={handleDevicePushToggle}
                  className="inline-flex h-11 w-14 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "relative h-7 w-[54px] rounded-full transition-colors",
                      push.enabled ? "bg-foreground" : "bg-muted-foreground/30",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute left-0.5 top-0.5 size-6 rounded-full bg-background shadow-sm transition-transform",
                        push.enabled && "translate-x-[26px]",
                      )}
                    />
                  </span>
                </button>
              </div>
              {(push.permission === "unsupported" || push.permission === "denied") && (
                <p id="devicePushDescription" className="text-[11px] leading-relaxed text-muted-foreground">
                  {push.permission === "unsupported"
                    ? "이 브라우저에서는 기기 알림을 사용할 수 없습니다."
                    : "브라우저 설정에서 알림 권한을 허용해 주세요."}
                </p>
              )}
            </div>

            {/* 저장 버튼 */}
            <div className="pt-4 flex items-center justify-end">
              <Button
                type="submit"
                disabled={isPending || push.isPending}
                className="w-full sm:w-auto min-w-32 h-10 bg-primary text-primary-foreground font-semibold shadow-sm"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    저장 중...
                  </>
                ) : (
                  "변경사항 저장하기"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <MarketingPushConsentDialog
        isOpen={pushConsentDialogOpen}
        isPending={push.isPending}
        onClose={() => setPushConsentDialogOpen(false)}
        onConfirm={() => {
          void push.consentAndEnablePush().then((ok) => {
            if (ok) setPushConsentDialogOpen(false);
          });
        }}
      />

      <LeaveConfirmDialog
        isOpen={showLeaveModal}
        title="페이지를 벗어나시겠습니까?"
        description="회원 정보 수정 중 변경된 내용이 저장되지 않았습니다. 지금 페이지를 벗어나면 변경사항이 모두 사라집니다."
        onClose={cancelLeave}
        onConfirm={confirmLeave}
      />
    </div>
  );
}
