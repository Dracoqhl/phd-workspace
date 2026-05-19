"use client";

import { createContext, ReactNode, useContext, useMemo, useState } from "react";

type SyncStatus = "synced" | "saving" | "failed";

interface SyncStatusContextValue {
  status: SyncStatus;
  lastSyncedAt: Date | null;
  error: string | null;
  trackSync: <T>(operation: Promise<T>) => Promise<T>;
}

const SyncStatusContext = createContext<SyncStatusContextValue>({
  status: "synced",
  lastSyncedAt: null,
  error: null,
  trackSync: async (operation) => operation
});

export function SyncStatusProvider({ children }: { children: ReactNode }) {
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function trackSync<T>(operation: Promise<T>): Promise<T> {
    setPendingCount((count) => count + 1);
    setError(null);

    try {
      const result = await operation;
      setLastSyncedAt(new Date());
      return result;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sync failed");
      throw caught;
    } finally {
      setPendingCount((count) => Math.max(0, count - 1));
    }
  }

  const value = useMemo<SyncStatusContextValue>(
    () => ({
      status: pendingCount > 0 ? "saving" : error ? "failed" : "synced",
      lastSyncedAt,
      error,
      trackSync
    }),
    [error, lastSyncedAt, pendingCount]
  );

  return <SyncStatusContext.Provider value={value}>{children}</SyncStatusContext.Provider>;
}

export function useSyncStatus() {
  return useContext(SyncStatusContext);
}

export function SyncStatusBadge() {
  const { status, lastSyncedAt, error } = useSyncStatus();

  const label = status === "saving" ? "Saving" : status === "failed" ? "Failed" : "Synced";
  const title = status === "failed" ? error ?? "Sync failed" : lastSyncedAt ? `Synced ${formatTime(lastSyncedAt)}` : label;
  const className =
    status === "saving"
      ? "border-sync-active bg-sync-active-soft text-sync-active-text"
      : status === "failed"
        ? "border-danger bg-danger-soft text-danger-text"
        : "border-sync-idle bg-sync-idle-soft text-sync-idle-text";

  return (
    <span
      aria-label="Data sync status"
      className={`inline-flex h-8 w-28 items-center justify-center rounded-md border px-2.5 text-xs font-semibold ${className}`}
      role="status"
      title={title}
    >
      {label}
    </span>
  );
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
