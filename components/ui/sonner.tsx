"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group font-sans"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border/80 group-[.toaster]:shadow-2xl group-[.toaster]:rounded-2xl group-[.toaster]:p-3.5 group-[.toaster]:gap-3 text-[13px] font-medium tracking-tight antialiased",
          title: "font-bold text-xs text-foreground tracking-tight leading-snug",
          description: "group-[.toast]:text-muted-foreground text-[11px] leading-relaxed tracking-tight",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground text-xs font-semibold rounded-lg px-2.5 py-1",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground text-xs rounded-lg px-2.5 py-1",
          icon: "group-[.toast]:text-primary shrink-0",
        },
        style: {
          fontFamily:
            '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, "Noto Sans KR", sans-serif',
          letterSpacing: "-0.02em",
          wordBreak: "keep-all",
        },
      }}
      position="top-right"
      richColors
      closeButton={false}
      duration={3500}
      {...props}
    />
  );
};

export { Toaster, toast };
