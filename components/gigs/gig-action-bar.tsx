import type { ReactNode } from "react";

export function GigActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-40 border-t border-border/60 bg-background/90 p-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur-md sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none">
      <div className="mx-auto flex max-w-md justify-center sm:max-w-none md:justify-start">
        {children}
      </div>
    </div>
  );
}
