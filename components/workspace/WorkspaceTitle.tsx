"use client";

import { useEffect, useRef, useState } from "react";

import { APP_VERSION, RELEASE_NOTES } from "@/lib/version";

const STORAGE_KEY = "phd-workspace-title-prefix";
const RELEASE_STORAGE_KEY = "phd-workspace-last-seen-version";
const DEFAULT_PREFIX = "我的";
const MAX_PREFIX_LENGTH = 12;

export function WorkspaceTitle() {
  const [prefix, setPrefix] = useState(DEFAULT_PREFIX);
  const [draft, setDraft] = useState(DEFAULT_PREFIX);
  const [editing, setEditing] = useState(false);
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState(APP_VERSION);
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
    try {
      if (window.localStorage.getItem(RELEASE_STORAGE_KEY) !== APP_VERSION) {
        setReleaseNotesOpen(true);
      }
    } catch {
      setReleaseNotesOpen(true);
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

  function openReleaseNotes() {
    setSelectedVersion(APP_VERSION);
    setReleaseNotesOpen(true);
  }

  function closeReleaseNotes() {
    setReleaseNotesOpen(false);
    try {
      window.localStorage.setItem(RELEASE_STORAGE_KEY, APP_VERSION);
    } catch {
      // Release notes can still be dismissed for the current session.
    }
  }

  return (
    <>
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
        <button
          aria-label={`查看 v${APP_VERSION} 更新日志`}
          className="mt-1 inline-flex h-6 items-center rounded-full border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-500 shadow-sm transition hover:border-moss/35 hover:bg-moss/10 hover:text-moss focus:outline-none focus:ring-2 focus:ring-moss/20"
          onClick={openReleaseNotes}
          type="button"
        >
          v{APP_VERSION}
        </button>
      </h1>
      {releaseNotesOpen ? (
        <ReleaseNotesDialog
          onClose={closeReleaseNotes}
          selectedVersion={selectedVersion}
          setSelectedVersion={setSelectedVersion}
        />
      ) : null}
    </>
  );
}

function ReleaseNotesDialog({
  onClose,
  selectedVersion,
  setSelectedVersion
}: {
  onClose: () => void;
  selectedVersion: string;
  setSelectedVersion: (version: string) => void;
}) {
  const selectedNote = RELEASE_NOTES.find((note) => note.version === selectedVersion) ?? RELEASE_NOTES[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6">
      <section
        aria-labelledby="release-notes-title"
        aria-modal="true"
        className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-moss">版本更新</p>
            <h2 className="mt-1 text-lg font-semibold text-ink" id="release-notes-title">
              v{selectedNote.version} {selectedNote.title}
            </h2>
            <p className="mt-1 text-xs text-slate-500">{selectedNote.date}</p>
          </div>
          <button
            className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-moss/20"
            onClick={onClose}
            type="button"
          >
            关闭
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="更新日志版本">
          {RELEASE_NOTES.map((note) => (
            <button
              aria-selected={note.version === selectedNote.version}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                note.version === selectedNote.version
                  ? "border-moss bg-moss/10 text-moss"
                  : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
              }`}
              key={note.version}
              onClick={() => setSelectedVersion(note.version)}
              role="tab"
              type="button"
            >
              v{note.version}
            </button>
          ))}
        </div>

        <p className="mt-4 text-sm leading-6 text-slate-600">{selectedNote.summary}</p>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
          {selectedNote.changes.map((change) => (
            <li className="flex gap-2" key={change}>
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-moss" />
              <span>{change}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
