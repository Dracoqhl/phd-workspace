"use client";

import { Heart, HeartCrack, RefreshCw, RotateCcw, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useSyncStatus } from "@/components/sync/SyncStatusProvider";
import type { CareRecord, CareTodayResponse, UpdateCareInput } from "@/types/care";

const defaultQuotePrompt = "温和、具体、低压力、适合长期计划";
const fieldControlClass = "border-field-border bg-field text-ink outline-none transition-colors placeholder:text-muted focus:border-moss focus:ring-2 focus:ring-moss/20 disabled:opacity-60";

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
  const [quotePreference, setQuotePreference] = useState("");
  const [lastSavedQuotePreference, setLastSavedQuotePreference] = useState("");
  const [quoteBatch, setQuoteBatch] = useState<string[]>([]);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [showQuoteSettings, setShowQuoteSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const updateSequence = useRef(0);

  useEffect(() => {
    let active = true;

    async function loadCare() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/care/today");
        const payload = (await response.json()) as Partial<CareTodayResponse> & { error?: string };

        if (!response.ok || !payload.care) {
          throw new Error(payload.error ?? "Unable to load care message.");
        }

        if (active) {
          applyCareState(normalizeCareTodayResponse(payload));
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

  function applyCareState(nextState: CareTodayResponse) {
    applyCare(nextState.care);
    setQuotePreference(nextState.quotePreference);
    setLastSavedQuotePreference(nextState.quotePreference);
    setQuoteBatch(nextState.quoteBatch);
    setQuoteIndex(nextState.quoteIndex);
  }

  async function retryCare() {
    if (quoteBatch.length > 1) {
      const nextIndex = (quoteIndex + 1) % quoteBatch.length;
      const nextContent = quoteBatch[nextIndex];
      setQuoteIndex(nextIndex);
      setCare((current) => (current ? { ...current, content: nextContent, updatedAt: new Date().toISOString() } : current));
      await updateCare({ content: nextContent });
      return;
    }

    const payload = await writeCare("/api/care/generate", { method: "POST", body: JSON.stringify({ preferenceText: quotePreference }) });
    if (payload) {
      applyCareState(payload);
    }
  }

  async function updateCare(input: UpdateCareInput) {
    const sequence = updateSequence.current + 1;
    updateSequence.current = sequence;
    const previousCare = care;
    const previousFocusText = focusText;
    const previousLastSavedFocusText = lastSavedFocusText;

    if (care) {
      setCare({ ...care, ...input, updatedAt: new Date().toISOString() });
    }
    if (typeof input.focusText === "string") {
      setFocusText(input.focusText);
    }
    if (typeof input.content === "string" && quoteBatch.length > 0) {
      setQuoteIndex(Math.max(0, quoteBatch.indexOf(input.content)));
    }

    const payload = await writeCare("/api/care/update", {
      method: "POST",
      body: JSON.stringify(input)
    });

    if (!payload) {
      setCare(previousCare);
      setFocusText(previousFocusText);
      setLastSavedFocusText(previousLastSavedFocusText);
      return;
    }

    if (sequence === updateSequence.current) {
      applyCareState(payload);
    }
  }

  function applyCare(nextCare: CareRecord) {
    setCare(nextCare);
    setFocusText(nextCare.focusText);
    setLastSavedFocusText(nextCare.focusText);
  }

  async function saveFocusText() {
    if (focusText === lastSavedFocusText) {
      return;
    }

    await updateCare({ focusText });
  }

  async function saveQuotePreference() {
    if (quotePreference.trim() === lastSavedQuotePreference.trim()) {
      return;
    }

    const preferenceText = quotePreference.trim();
    const payload = await writeCare("/api/care/generate", {
      method: "POST",
      body: JSON.stringify({ preferenceText })
    });

    if (payload) {
      applyCareState(payload);
      return;
    }

    setQuotePreference(lastSavedQuotePreference);
  }

  async function resetQuotePreference() {
    setQuotePreference(defaultQuotePrompt);
    const payload = await writeCare("/api/care/generate", {
      method: "POST",
      body: JSON.stringify({ preferenceText: defaultQuotePrompt })
    });

    if (payload) {
      applyCareState(payload);
      return;
    }

    setQuotePreference(lastSavedQuotePreference);
  }

  async function writeCare(url: string, init: RequestInit): Promise<CareTodayResponse | null> {
    setSaving(true);
    setError(null);

    try {
      const payload = await trackSync(
        (async () => {
          const response = await fetch(url, {
            ...init,
            headers: { "Content-Type": "application/json", ...(init.headers ?? {}) }
          });
          const responsePayload = (await response.json()) as Partial<CareTodayResponse> & { error?: string };

          if (!response.ok || !responsePayload.care) {
            throw new Error(responsePayload.error ?? "Unable to save care message.");
          }

          return normalizeCareTodayResponse(responsePayload);
        })()
      );

      return payload;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save care message.");
      return null;
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
                disabled={loading}
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

      <div className="mt-3 rounded-md border border-care bg-care-soft px-3 py-3" data-testid="care-quote-panel">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-care-text">Daily quote</span>
          <div className="flex items-center gap-1">
            <button
              aria-label="Retry care message"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-care-text hover:bg-care/10 disabled:opacity-60"
              disabled={loading || saving}
              onClick={() => void retryCare()}
              type="button"
            >
              <RefreshCw aria-hidden="true" className={saving ? "animate-spin" : undefined} data-testid="care-refresh-icon" size={14} />
            </button>
            <button
              aria-label="Quote settings"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-care-text hover:bg-care/10 disabled:opacity-60"
              disabled={loading || saving}
              onClick={() => setShowQuoteSettings((current) => !current)}
              type="button"
            >
              <Settings aria-hidden="true" size={15} />
            </button>
          </div>
        </div>
        <p className="text-sm leading-6 text-slate-800">{content}</p>
        {showQuoteSettings ? (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-care-text" htmlFor="quote-prompt">
                Quote prompt
              </label>
              <button
                aria-label="Reset quote prompt"
                className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs font-semibold text-care-text hover:bg-care/10 disabled:opacity-60"
                disabled={loading || saving}
                onClick={() => void resetQuotePreference()}
                type="button"
              >
                <RotateCcw aria-hidden="true" size={13} />
                重置
              </button>
            </div>
            <input
              aria-label="Quote prompt"
              className={`h-8 w-full rounded-md border px-2 text-xs ${fieldControlClass}`}
              disabled={loading || saving}
              id="quote-prompt"
              onBlur={() => void saveQuotePreference()}
              onChange={(event) => setQuotePreference(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
              value={quotePreference}
            />
          </div>
        ) : null}
      </div>

      <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        Today focus
        <input
          aria-label="Today focus"
          className={`mt-1 h-9 w-full rounded-md border px-2.5 text-sm font-normal normal-case tracking-normal ${fieldControlClass}`}
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
        <p className="mt-2 rounded-md border border-danger bg-danger-soft px-3 py-2 text-sm text-danger-text" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function normalizeCareTodayResponse(payload: Partial<CareTodayResponse>): CareTodayResponse {
  const care = payload.care!;
  return {
    care,
    quotePreference: typeof payload.quotePreference === "string" ? payload.quotePreference : "",
    quoteBatch: Array.isArray(payload.quoteBatch) && payload.quoteBatch.length > 0 ? payload.quoteBatch : [care.content],
    quoteIndex: typeof payload.quoteIndex === "number" ? payload.quoteIndex : 0
  };
}

function energyButtonClass(currentLevel: CareRecord["energyLevel"]): string {
  const tone =
    currentLevel === 5
      ? "text-energy hover:text-energy-text"
      : currentLevel
        ? "text-energy hover:text-energy-text"
        : "text-energy-muted hover:text-energy";

  return `inline-flex h-7 w-7 items-center justify-center rounded-full transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-moss/40 disabled:opacity-60 ${tone}`;
}

function EnergyIcon({ currentLevel, index }: { currentLevel: CareRecord["energyLevel"]; index: number }) {
  if (currentLevel === 5) {
    return <EnergyBrightBadge />;
  }

  if (currentLevel === 1 && index === 1) {
    return <HeartCrack aria-hidden="true" className="text-energy" data-testid="energy-broken-heart" size={18} />;
  }

  if (currentLevel && index <= currentLevel) {
    return <Heart aria-hidden="true" className="fill-current text-energy" size={18} />;
  }

  return <Heart aria-hidden="true" size={18} />;
}

function EnergyBrightBadge() {
  return (
    <svg
      aria-hidden="true"
      className="drop-shadow-sm"
      data-testid="energy-bright-badge"
      height="18"
      viewBox="0 0 24 24"
      width="18"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" fill="var(--color-energy)" r="10.4" />
      <circle cx="12" cy="12" fill="color-mix(in oklch, var(--color-energy) 72%, var(--color-surface))" r="8.2" />
      <path d="M12 4.9l1.45 3.8 3.85 1.4-3.85 1.45L12 15.35l-1.45-3.8-3.85-1.45 3.85-1.4L12 4.9z" fill="var(--color-surface)" />
      <path d="M17.8 14.2l.55 1.45 1.45.55-1.45.55-.55 1.45-.55-1.45-1.45-.55 1.45-.55.55-1.45z" fill="var(--color-surface)" opacity="0.9" />
    </svg>
  );
}
