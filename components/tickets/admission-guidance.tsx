"use client";

import { useEffect, useState } from "react";
import { ticketAdmissionGuidance } from "@/lib/ticket-reservations";

export function AdmissionGuidance({
  performanceMs,
  admissionMs,
  initialNow,
  canEnter,
}: {
  performanceMs: number | null;
  admissionMs: number | null;
  initialNow: number;
  canEnter: boolean;
}) {
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    if (performanceMs === null || initialNow >= performanceMs) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= performanceMs) window.clearInterval(timer);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [initialNow, performanceMs]);

  const { performance, admission } = ticketAdmissionGuidance(
    performanceMs, admissionMs, Math.max(now, initialNow), canEnter,
  );
  if (!performance && !admission) return null;

  return (
    <div className="space-y-1 border-t pt-3 text-sm">
      {admission && <p className="font-medium">{admission}</p>}
      {performance && <p className="text-muted-foreground">{performance}</p>}
    </div>
  );
}
