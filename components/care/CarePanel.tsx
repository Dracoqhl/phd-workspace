"use client";

import { Heart, HeartCrack, RefreshCw, Star } from "lucide-react";
import { useEffect, useState } from "react";

import { useSyncStatus } from "@/components/sync/SyncStatusProvider";
import type { CareRecord, UpdateCareInput } from "@/types/care";

const energyLabels: Record<NonNullable<CareRecord["energyLevel"]>, string> = {
  1: "Low",
  2: "Soft",
  3: "Steady",
  4: "Ready",
  5: "Bright"
};

export function CarePanel() {
  const { trackSync } = useSyncStatus();
  const [care, setCare] = useState<CareRecord | null>(null);
  const [focusText, setFocusText] = useState("");
  const [lastSavedFocusText, setLastSavedFocusText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadCare() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/care/today");
        const payload = (await response.json()) as { care?: CareRecord; error?: string };

        if (!response.ok || !payload.care) {
          throw new Error(payload.error ?? "Unable to load care message.");
        }

        if (active) {
          applyCare(payload.care);
        }
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Unable to load care message.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadCare();

    return () => {
      active = false;
    };
  }, []);

  function applyCare(nextCare: CareRecord) {
    setCare(nextCare);
    setFocusText(nextCare.focusText);
    setLastSavedFocusText(nextCare.focusText);
  }

  async function retryCare() {
    await writeCare("/api/care/generate", { method: "POST" });
  }

  async function updateCare(input: UpdateCareInput) {
    const previousCare = care;
    const previousFocusText = focusText;
    const previousLastSavedFocusText = lastSavedFocusText;

    if (care) {
      setCare({ ...care, ...input, updatedAt: new Date().toISOString() });
    }
    if (typeof input.focusText === "string") {
      setFocusText(input.focusText);
    }

    const saved = await writeCare("/api/care/update", {
      method: "POST",
      body: JSON.stringify(input)
    });

    if (!saved) {
      setCare(previousCare);
      setFocusText(previousFocusText);
      setLastSavedFocusText(previousLastSavedFocusText);
    }
  }

  async function saveFocusText() {
    if (focusText === lastSavedFocusText) {
      return;
    }

    await updateCare({ focusText });
  }

  async function writeCare(url: string, init: RequestInit): Promise<boolean> {
    setSaving(true);
    setError(null);

    try {
      const payload = await trackSync(
        (async () => {
          const response = await fetch(url, {
            ...init,
            headers: { "Content-Type": "application/json", ...(init.headers ?? {}) }
          });
          const responsePayload = (await response.json()) as { care?: CareRecord; error?: string };

          if (!response.ok || !responsePayload.care) {
            throw new Error(responsePayload.error ?? "Unable to save care message.");
          }

          return { care: responsePayload.care };
        })()
      );

      applyCare(payload.care);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save care message.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  const energyLevel = care?.energyLevel ?? null;
  const energyLabel = energyLevel ? energyLabels[energyLevel] : "Unset";
  const content = loading ? "Loading care message..." : care?.content ?? "今天不需要一次解决所有问题，只要往前走一点点就很好。";

  return (
    <section aria-label="心灵关怀" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2" data-testid="care-header">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">心灵关怀</h2>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex w-[148px] items-center justify-end gap-0.5" data-testid="care-energy-icons">
            {[1, 2, 3, 4, 5].map((level) => (
              <button
                aria-label={`Set energy to ${level}`}
                className={energyButtonClass(energyLevel)}
                disabled={loading || saving}
                key={level}
                onClick={() => void updateCare({ energyLevel: level as CareRecord["energyLevel"] })}
                type="button"
              >
                <EnergyIcon currentLevel={energyLevel} index={level} />
              </button>
            ))}
          </div>
          <span
            className="inline-flex w-14 justify-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600"
            data-testid="care-energy-status"
          >
            {energyLabel}
          </span>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-amber-100 bg-amber-50 px-3 py-3" data-testid="care-quote-panel">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">Daily quote</span>
          <div className="flex items-center gap-1">
            <button
              aria-label="Retry care message"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-amber-700 hover:bg-amber-100 disabled:opacity-60"
              disabled={loading || saving}
              onClick={() => void retryCare()}
              type="button"
            >
              <RefreshCw aria-hidden="true" size={14} />
            </button>
            <button
              aria-label={care?.isFavorite ? "Unfavorite care message" : "Favorite care message"}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-amber-700 hover:bg-amber-100 disabled:opacity-60"
              disabled={loading || saving}
              onClick={() => void updateCare({ isFavorite: !care?.isFavorite })}
              type="button"
            >
              <Star aria-hidden="true" className={care?.isFavorite ? "fill-current" : ""} size={15} />
            </button>
          </div>
        </div>
        <p className="text-sm leading-6 text-slate-800">{content}</p>
      </div>

      <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        Today focus
        <input
          aria-label="Today focus"
          className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2.5 text-sm font-normal normal-case tracking-normal text-ink outline-none placeholder:text-slate-400 focus:border-moss disabled:opacity-60"
          disabled={loading}
          onBlur={() => void saveFocusText()}
          onChange={(event) => setFocusText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          placeholder="今天最想完成的一件事..."
          value={focusText}
        />
      </label>

      {error ? (
        <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function energyButtonClass(currentLevel: CareRecord["energyLevel"]): string {
  const tone =
    currentLevel === 5
      ? "text-amber-500 hover:text-orange-500"
      : currentLevel
        ? "text-rose-500 hover:text-rose-600"
        : "text-slate-300 hover:text-rose-500";

  return `inline-flex h-7 w-7 items-center justify-center rounded-full transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-moss/40 disabled:opacity-60 ${tone}`;
}

function EnergyIcon({ currentLevel, index }: { currentLevel: CareRecord["energyLevel"]; index: number }) {
  if (currentLevel === 5) {
    return (
      <svg
        aria-hidden="true"
        className="fill-amber-400 text-orange-500 drop-shadow-sm"
        data-testid="energy-sun"
        fill="none"
        height="18"
        viewBox="0 0 24 24"
        width="18"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M12 1.75l1.45 3.32 3.18-1.74-.74 3.55 3.62.18-2.57 2.55 2.57 2.55-3.62.18.74 3.55-3.18-1.74L12 22.25l-1.45-3.32-3.18 1.74.74-3.55-3.62-.18 2.57-2.55-2.57-2.55 3.62-.18-.74-3.55 3.18 1.74L12 1.75z"
          fill="currentColor"
        />
        <circle cx="12" cy="12" fill="#fbbf24" r="5.4" />
        <circle cx="10.25" cy="9.75" fill="white" opacity="0.7" r="1.35" />
      </svg>
    );
  }

  if (currentLevel === 1 && index === 1) {
    return <HeartCrack aria-hidden="true" className="text-rose-500" data-testid="energy-broken-heart" size={18} />;
  }

  if (currentLevel && index <= currentLevel) {
    return <Heart aria-hidden="true" className="fill-current text-rose-500" size={18} />;
  }

  return <Heart aria-hidden="true" size={18} />;
}
