"use client";

import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "phd-workspace-title-prefix";
const DEFAULT_PREFIX = "我的";
const MAX_PREFIX_LENGTH = 12;

export function WorkspaceTitle() {
  const [prefix, setPrefix] = useState(DEFAULT_PREFIX);
  const [draft, setDraft] = useState(DEFAULT_PREFIX);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)?.trim();
      if (stored) {
        setPrefix(stored.slice(0, MAX_PREFIX_LENGTH));
      }
    } catch {
      // The default title remains available if localStorage is blocked.
    }
  }, []);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function startEditing() {
    setDraft(prefix);
    setEditing(true);
  }

  function savePrefix() {
    const nextPrefix = draft.trim().slice(0, MAX_PREFIX_LENGTH) || DEFAULT_PREFIX;
    setPrefix(nextPrefix);
    setDraft(nextPrefix);
    setEditing(false);

    try {
      window.localStorage.setItem(STORAGE_KEY, nextPrefix);
    } catch {
      // The visible title is still updated for the current session.
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-full border border-moss/25 bg-moss/10 px-2 py-0.5 text-xs font-semibold text-moss">
          可自定义
        </span>
        <span className="text-xs text-slate-500">点击高亮文字修改工作台名称</span>
      </div>
      <h1 className="flex flex-wrap items-center gap-2 text-3xl font-semibold tracking-normal text-ink">
        {editing ? (
          <input
            aria-label="工作台名称前缀"
            className="min-w-0 max-w-48 rounded-md border border-moss bg-white px-2 py-1 text-2xl font-semibold text-ink outline-none ring-2 ring-moss/15"
            maxLength={MAX_PREFIX_LENGTH}
            onBlur={savePrefix}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                savePrefix();
              }
              if (event.key === "Escape") {
                setDraft(prefix);
                setEditing(false);
              }
            }}
            ref={inputRef}
            value={draft}
          />
        ) : (
          <button
            aria-label="修改工作台名称前缀"
            className="rounded-md bg-moss/10 px-2 py-1 text-3xl font-semibold text-moss transition hover:bg-moss/15 focus:outline-none focus:ring-2 focus:ring-moss/25"
            onClick={startEditing}
            type="button"
          >
            {prefix}
          </button>
        )}
        <span>工作台</span>
      </h1>
    </div>
  );
}
