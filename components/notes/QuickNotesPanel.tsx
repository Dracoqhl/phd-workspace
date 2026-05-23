"use client";

import { Plus, Trash2 } from "lucide-react";
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSyncStatus } from "@/components/sync/SyncStatusProvider";
import type { QuickNote } from "@/types/note";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "failed";

const fieldControlClass =
  "border-field-border bg-field text-ink outline-none transition-colors placeholder:text-muted focus:border-moss focus:ring-2 focus:ring-moss/20";

const tagToneClasses = [
  "border-accent bg-accent-soft text-primary",
  "border-info bg-info-soft text-info-text",
  "border-success bg-success-soft text-success-text",
  "border-warning bg-warning-soft text-warning-text",
  "border-energy bg-energy-soft text-energy-text",
  "border-proposal bg-proposal-soft text-proposal-text",
  "border-status-next bg-status-next-soft text-status-next-text"
];

export function QuickNotesPanel() {
  const { trackSync } = useSyncStatus();
  const [notes, setNotes] = useState<QuickNote[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Pick<QuickNote, "tag" | "title" | "content">>({ tag: "", title: "", content: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSequences = useRef(new Map<string, number>());
  const selectedNote = useMemo(() => notes.find((note) => note.id === selectedNoteId) ?? null, [notes, selectedNoteId]);
  const noteGroups = useMemo(() => groupNotesByCreatedDate(notes), [notes]);

  const clearSaveTimer = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function loadNotes() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/notes");
        const payload = (await response.json()) as { notes?: QuickNote[]; error?: string };

        if (!response.ok || !payload.notes) {
          throw new Error(payload.error ?? "Unable to load notes.");
        }

        if (!active) return;
        let nextNotes = payload.notes;
        if (nextNotes.length === 0) {
          const created = await writeNote("/api/notes", { method: "POST" });
          if (!active) return;
          nextNotes = [created];
        }
        setNotes(nextNotes);
        const firstNote = nextNotes[0] ?? null;
        setSelectedNoteId(firstNote?.id ?? null);
        setDraft(toDraft(firstNote));
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Unable to load notes.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadNotes();

    return () => {
      active = false;
      clearSaveTimer();
    };
  }, [clearSaveTimer]);

  function selectNote(note: QuickNote) {
    clearSaveTimer();
    setSelectedNoteId(note.id);
    setDraft(toDraft(note));
    setSaveState("idle");
    setLastSavedAt(note.updatedAt ? new Date(note.updatedAt) : null);
  }

  async function createNote() {
    clearSaveTimer();
    setError(null);

    try {
      const created = await trackSync(writeNote("/api/notes", { method: "POST" }));
      setNotes((current) => [created, ...current]);
      setSelectedNoteId(created.id);
      setDraft(toDraft(created));
      setSaveState("idle");
      setLastSavedAt(null);
    } catch {
      setError("无法新建随手记。");
    }
  }

  function updateDraft(field: "tag" | "title" | "content", value: string) {
    if (!selectedNoteId) return;
    const normalizedValue = field === "tag" ? value.slice(0, 4) : value;
    const nextDraft = { ...draft, [field]: normalizedValue };
    setDraft(nextDraft);
    setSaveState("dirty");
    setError(null);
    setNotes((current) => current.map((note) => (note.id === selectedNoteId ? { ...note, ...nextDraft } : note)));
    scheduleSave(selectedNoteId, nextDraft);
  }

  function scheduleSave(noteId: string, nextDraft: Pick<QuickNote, "tag" | "title" | "content">) {
    clearSaveTimer();
    const sequence = (saveSequences.current.get(noteId) ?? 0) + 1;
    saveSequences.current.set(noteId, sequence);

    saveTimer.current = setTimeout(() => {
      void saveDraft(noteId, nextDraft, sequence);
    }, 700);
  }

  async function saveDraft(noteId: string, nextDraft: Pick<QuickNote, "tag" | "title" | "content">, sequence: number) {
    setSaveState("saving");

    try {
      const updated = await trackSync(
        writeNote(`/api/notes/${noteId}`, {
          method: "PATCH",
          body: JSON.stringify(nextDraft)
        })
      );

      if (saveSequences.current.get(noteId) !== sequence) return;
      setNotes((current) => current.map((note) => (note.id === noteId ? { ...updated, ...nextDraft } : note)));
      setLastSavedAt(new Date());
      setSaveState("saved");
    } catch {
      if (saveSequences.current.get(noteId) === sequence) {
        setSaveState("failed");
      }
    }
  }

  async function deleteNote(note: QuickNote) {
    if (!window.confirm("删除这条随手记？")) return;
    clearSaveTimer();

    try {
      await trackSync(
        fetch(`/api/notes/${note.id}`, {
          method: "DELETE"
        }).then(async (response) => {
          if (!response.ok) {
            throw new Error("Unable to delete note.");
          }
          return response.json() as Promise<{ deleted: boolean }>;
        })
      );

      setNotes((current) => {
        const nextNotes = current.filter((item) => item.id !== note.id);
        if (selectedNoteId === note.id) {
          const nextSelection = nextNotes[0] ?? null;
          setSelectedNoteId(nextSelection?.id ?? null);
          setDraft(toDraft(nextSelection));
          setSaveState("idle");
          setLastSavedAt(null);
        }
        return nextNotes;
      });
    } catch {
      setError("无法删除随手记。");
    }
  }

  return (
    <section aria-label="随手记" className="rounded-lg border border-line bg-surface shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">随手记</h2>
        </div>
        <span aria-label="随手记保存状态" className={saveStatusClass(saveState)} role="status">
          {formatSaveStatus(saveState, lastSavedAt)}
        </span>
      </div>

      <div className="grid min-h-[22rem] gap-0 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 border-b border-line p-3 lg:border-b-0 lg:border-r">
          {selectedNote ? (
            <div className="flex h-full min-w-0 flex-col gap-2">
              <div className="grid min-w-0 items-start gap-2 sm:grid-cols-[minmax(5rem,7rem)_minmax(0,1fr)]">
                <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted">
                  <span>标签</span>
                  <input
                    aria-label="随手记标签"
                    className={`h-8 min-w-0 rounded-md border px-2.5 text-sm ${fieldControlClass}`}
                    maxLength={4}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updateDraft("tag", event.target.value)}
                    placeholder="最多4字"
                    value={draft.tag}
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted">
                  <span>标题</span>
                  <input
                    aria-label="随手记标题"
                    className={`h-8 min-w-0 rounded-md border px-3 text-sm font-semibold ${fieldControlClass}`}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updateDraft("title", event.target.value)}
                    placeholder="未命名记录"
                    value={draft.title}
                  />
                </label>
              </div>
              <label className="flex min-h-0 flex-1 flex-col gap-1 text-sm font-medium text-muted">
                <span>正文</span>
                <textarea
                  aria-label="随手记正文"
                  className={`min-h-40 flex-1 resize-y rounded-md border px-3 py-2 text-sm leading-6 ${fieldControlClass}`}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) => updateDraft("content", event.target.value)}
                  placeholder="写下一点也可以，系统会自动保存。"
                  value={draft.content}
                />
              </label>
            </div>
          ) : (
            <div className="flex min-h-72 items-center justify-center rounded-md border border-dashed border-line bg-surface-muted px-4 text-center text-sm text-muted">
              选择或新建一条随手记后开始记录。
            </div>
          )}
        </div>

        <aside className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {loading ? <p className="px-2 py-8 text-center text-sm text-muted">正在加载随手记...</p> : null}
            <ul aria-label="随手记列表" className="grid gap-2" role="list">
              {noteGroups.pinned.length > 0 ? (
                <>
                  <NoteGroupHeader label="置顶" />
                  {noteGroups.pinned.map((note) => renderNoteListItem(note, selectedNoteId, selectNote, deleteNote))}
                </>
              ) : null}
              {noteGroups.today.length > 0 ? (
                <>
                  <NoteGroupHeader label="当天" />
                  {noteGroups.today.map((note) => renderNoteListItem(note, selectedNoteId, selectNote, deleteNote))}
                </>
              ) : null}
              {noteGroups.past.length > 0 ? (
                <>
                  <li aria-hidden="true" className="my-1 border-t border-dashed border-line" data-testid="past-notes-divider" />
                  <NoteGroupHeader label="往日" />
                  {noteGroups.past.map((note) => renderNoteListItem(note, selectedNoteId, selectNote, deleteNote))}
                </>
              ) : null}
            </ul>
          </div>
          <div className="border-t border-line p-3">
            <button
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-paper transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent/35"
              onClick={() => void createNote()}
              type="button"
            >
              <Plus aria-hidden="true" size={16} />
              新建记录
            </button>
          </div>
        </aside>
      </div>

      {error ? <p className="border-t border-line px-4 py-3 text-sm text-danger-text">{error}</p> : null}
    </section>
  );
}

function NoteGroupHeader({ label }: { label: string }) {
  return (
    <li className="px-1 pt-1 text-[11px] font-semibold text-muted" role="presentation">
      {label}
    </li>
  );
}

function renderNoteListItem(
  note: QuickNote,
  selectedNoteId: string | null,
  selectNote: (note: QuickNote) => void,
  deleteNote: (note: QuickNote) => Promise<void>
) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_2rem] items-stretch gap-1" key={note.id}>
      <button
        aria-label={`打开记录 ${displayTitle(note.title)}`}
        className={`min-w-0 rounded-md border px-2.5 py-1.5 text-left transition hover:bg-surface-muted ${
          selectedNoteId === note.id ? "border-accent bg-accent-soft/50" : "border-line bg-surface"
        }`}
        onClick={() => selectNote(note)}
        type="button"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className={`max-w-16 shrink-0 truncate rounded border px-1.5 py-0.5 text-[11px] font-semibold ${noteTagToneClass(note.tag)}`}>
            {displayTag(note.tag)}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{displayTitle(note.title)}</span>
          <span className="shrink-0 text-[11px] font-medium text-muted">{formatDate(note.createdAt)}</span>
        </span>
      </button>
      <button
        aria-label={`删除记录 ${displayTitle(note.title)}`}
        className="inline-flex h-full min-h-9 items-center justify-center rounded-md text-action-muted transition hover:bg-delete-soft hover:text-delete focus:outline-none focus:ring-2 focus:ring-delete/30"
        onClick={() => void deleteNote(note)}
        type="button"
      >
        <Trash2 aria-hidden="true" size={15} />
      </button>
    </li>
  );
}

async function writeNote(url: string, init: RequestInit): Promise<QuickNote> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers
    }
  });
  const payload = (await response.json()) as { note?: QuickNote; error?: string };

  if (!response.ok || !payload.note) {
    throw new Error(payload.error ?? "Unable to save note.");
  }

  return payload.note;
}

function toDraft(note: QuickNote | null): Pick<QuickNote, "tag" | "title" | "content"> {
  return {
    tag: note?.tag ?? "",
    title: note?.title ?? "",
    content: note?.content ?? ""
  };
}

function displayTag(tag: string): string {
  return tag.trim() || "无标签";
}

function displayTitle(title: string): string {
  return title.trim() || "未命名记录";
}

function groupNotesByCreatedDate(notes: QuickNote[]): { pinned: QuickNote[]; today: QuickNote[]; past: QuickNote[] } {
  const today = formatDate(new Date().toISOString());
  return {
    pinned: [],
    today: notes.filter((note) => formatDate(note.createdAt) === today),
    past: notes.filter((note) => formatDate(note.createdAt) !== today)
  };
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-CA");
}

function noteTagToneClass(tag: string): string {
  const normalized = tag.trim();
  if (!normalized) {
    return "border-line bg-surface-muted text-muted";
  }
  return tagToneClasses[hashText(normalized) % tagToneClasses.length];
}

function hashText(text: string): number {
  let hash = 0;
  for (const char of text) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function saveStatusClass(saveState: SaveState): string {
  const baseClass = "inline-flex h-8 min-w-28 items-center justify-center rounded-md border px-2.5 text-xs font-semibold";
  if (saveState === "saving" || saveState === "dirty") {
    return `${baseClass} border-sync-active bg-sync-active-soft text-sync-active-text`;
  }
  if (saveState === "failed") {
    return `${baseClass} border-danger bg-danger-soft text-danger-text`;
  }
  return `${baseClass} border-sync-idle bg-sync-idle-soft text-sync-idle-text`;
}

function formatSaveStatus(saveState: SaveState, lastSavedAt: Date | null): string {
  if (saveState === "dirty") return "未保存";
  if (saveState === "saving") return "保存中...";
  if (saveState === "failed") return "保存失败，继续编辑后会重试";
  if (saveState === "saved" && lastSavedAt) {
    return `已保存 ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
  return "已保存";
}
