"use client";

import { useSyncExternalStore } from "react";

const query = "(max-width: 639px)";
function subscribe(callback: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

export function useMobileLayout() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
