"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface LeaveConfirmDialogProps {
  isOpen: boolean;
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onClose: () => void;
  onConfirm: () => void;
}

export function LeaveConfirmDialog({
  isOpen,
  title = "페이지를 벗어나시겠습니까?",
  description = "작성 및 수정 중인 내용이 저장되지 않았습니다. 지금 페이지를 벗어나면 변경사항이 모두 사라집니다.",
  confirmText = "나가기 (저장 안 함)",
  cancelText = "계속 작성하기",
  onClose,
  onConfirm,
}: LeaveConfirmDialogProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3.5">
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
            <AlertTriangle className="size-6" />
          </div>
          <div className="space-y-1.5 flex-1 min-w-0">
            <h3 className="text-base font-bold text-foreground">
              {title}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {description}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border/60">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs font-semibold h-9 px-4"
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            className="text-xs font-semibold h-9 px-4 shadow-sm"
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function useUnsavedChangesWarning({
  isDirty,
  defaultBackLink,
}: {
  isDirty: boolean;
  defaultBackLink?: string;
}) {
  const router = useRouter();
  const isSubmittingRef = useRef(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [pendingNavUrl, setPendingNavUrl] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // 1. 브라우저 탭 닫기 / 새로고침 차단
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty && !isSubmittingRef.current) {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // 2. 내부 링크 클릭 가로채기 (capture phase)
  useEffect(() => {
    if (!isDirty) return;

    const handleAnchorClick = (e: MouseEvent) => {
      if (isSubmittingRef.current) return;

      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
      if (anchor.target === "_blank" || e.ctrlKey || e.metaKey) return;
      if (anchor.href === window.location.href) return;

      e.preventDefault();
      e.stopPropagation();
      setPendingNavUrl(anchor.href);
      setPendingAction(null);
      setShowLeaveModal(true);
    };

    document.addEventListener("click", handleAnchorClick, true);
    return () => document.removeEventListener("click", handleAnchorClick, true);
  }, [isDirty]);

  // 3. 브라우저 뒤로가기 / 앞으로가기 (popstate)
  useEffect(() => {
    if (!isDirty) return;

    const handlePopState = () => {
      if (isSubmittingRef.current) return;
      const stay = !window.confirm(
        "작성 및 수정 중인 내용이 저장되지 않았습니다. 페이지를 벗어나시겠습니까?"
      );
      if (stay) {
        window.history.pushState(null, "", window.location.href);
      } else {
        isSubmittingRef.current = true;
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isDirty]);

  const confirmLeave = () => {
    isSubmittingRef.current = true;
    setShowLeaveModal(false);

    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
      setPendingNavUrl(null);
      return;
    }

    const target = pendingNavUrl || defaultBackLink;
    if (target) {
      if (target.startsWith(window.location.origin)) {
        const path = target.slice(window.location.origin.length);
        router.push(path);
      } else if (target.startsWith("/")) {
        router.push(target);
      } else {
        window.location.href = target;
      }
    } else {
      router.back();
    }
  };

  const cancelLeave = () => {
    setShowLeaveModal(false);
    setPendingNavUrl(null);
    setPendingAction(null);
  };

  const handleInterceptedNavigation = (targetUrl?: string) => {
    if (isDirty) {
      setPendingNavUrl(targetUrl || defaultBackLink || null);
      setPendingAction(null);
      setShowLeaveModal(true);
    } else if (targetUrl) {
      router.push(targetUrl);
    } else if (defaultBackLink) {
      router.push(defaultBackLink);
    } else {
      router.back();
    }
  };

  const triggerConfirm = (action: () => void) => {
    if (isDirty) {
      setPendingAction(() => action);
      setShowLeaveModal(true);
    } else {
      action();
    }
  };

  const markSubmitting = () => {
    isSubmittingRef.current = true;
  };

  return {
    showLeaveModal,
    cancelLeave,
    confirmLeave,
    handleInterceptedNavigation,
    triggerConfirm,
    markSubmitting,
    isSubmittingRef,
  };
}
