"use client";

import { RefreshCw, Check } from "lucide-react";
import { useEffect, useState } from "react";

import type { CareRecord } from "@/types/care";

export function CarePanel() {
  const [care, setCare] = useState<CareRecord | null>(null);
  const [moodNote, setMoodNote] = useState("");
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
          setCare(payload.care);
          setMoodNote(payload.care.moodNote);
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

  async function retryCare() {
    await writeCare("/api/care/generate", { method: "POST" });
  }

  async function checkInCare() {
    await writeCare("/api/care/checkin", {
      method: "POST",
      body: JSON.stringify({ isChecked: true, moodNote })
    });
  }

  async function writeCare(url: string, init: RequestInit) {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(url, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init.headers ?? {}) }
      });
      const payload = (await response.json()) as { care?: CareRecord; error?: string };

      if (!response.ok || !payload.care) {
        throw new Error(payload.error ?? "Unable to save care message.");
      }

      setCare(payload.care);
      setMoodNote(payload.care.moodNote);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save care message.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="心灵关怀" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">心灵关怀</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {loading ? "Loading care message..." : care?.content ?? "今天不需要一次解决所有问题，只要往前走一点点就很好。"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button aria-label="Retry care message" className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60" disabled={loading || saving} onClick={() => void retryCare()} type="button">
            <RefreshCw aria-hidden="true" size={13} />
            Retry
          </button>
          <button aria-label={care?.isChecked ? "Care checked" : "Check in care"} className={`inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-semibold ${care?.isChecked ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-ink text-white hover:bg-slate-700"}`} disabled={loading || saving || care?.isChecked} onClick={() => void checkInCare()} type="button">
            <Check aria-hidden="true" size={13} />
            {care?.isChecked ? "Checked" : "Check in"}
          </button>
        </div>
      </div>

      <label className="mt-3 block text-xs font-medium text-slate-500">
        Mood note
        <input aria-label="Mood note" className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-sm font-normal text-ink outline-none focus:border-moss" disabled={loading || saving} onChange={(event) => setMoodNote(event.target.value)} placeholder="一句今日心情" value={moodNote} />
      </label>

      {error ? <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p> : null}
    </section>
  );
}
