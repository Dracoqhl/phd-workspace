"use client";

import { ExternalLink, MoreHorizontal, Plus, Star, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import type { QuickLink, QuickLinkGroup } from "@/types/quick-link";

interface QuickLinkResponse {
  groups: QuickLinkGroup[];
}

const DELETE_SKIP_STORAGE_KEY = "phd-workspace-quick-link-delete-skip-date";

export function QuickLinkDock() {
  const [groups, setGroups] = useState<QuickLinkGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [managedGroupId, setManagedGroupId] = useState<string | null>(null);
  const [failedIconIds, setFailedIconIds] = useState<Set<string>>(() => new Set());
  const [pendingDelete, setPendingDelete] = useState<{ message: string; action: () => Promise<void> } | null>(null);

  useEffect(() => {
    let active = true;
    async function loadGroups() {
      try {
        const response = await fetch("/api/quick-links");
        if (!response.ok) return;
        const payload = (await response.json()) as QuickLinkResponse;
        if (active) setGroups(payload.groups);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadGroups();
    return () => {
      active = false;
    };
  }, []);

  const managedGroup = groups.find((group) => group.id === managedGroupId) ?? null;

  async function openDefaultLink(group: QuickLinkGroup) {
    const defaultLink = group.links.find((link) => link.id === group.defaultLinkId) ?? group.links[0];
    if (!defaultLink) return;
    window.open(defaultLink.url, "_blank", "noopener,noreferrer");
  }

  async function requestDelete(message: string, action: () => Promise<void>) {
    if (shouldSkipDeleteConfirmToday()) {
      await action();
      return;
    }
    setPendingDelete({ message, action });
  }

  if (!loading && groups.length === 0) {
    return (
      <div className="relative">
        <div className="flex items-center">
          <AddQuickLinkButton onClick={() => setAddOpen(true)} />
        </div>
        {addOpen ? <AddQuickLinkDialog onClose={() => setAddOpen(false)} onGroupsChange={setGroups} /> : null}
        {pendingDelete ? <DeleteConfirmDialog onClose={() => setPendingDelete(null)} pendingDelete={pendingDelete} /> : null}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="custom-scrollbar flex items-end gap-2 overflow-x-auto rounded-lg border border-slate-200 bg-white/75 px-3 py-2 shadow-sm">
        {groups.map((group) => (
          <div className="group/link relative flex w-16 shrink-0 flex-col items-center gap-1" key={group.id}>
            <button
              aria-label={`打开 ${group.displayName}`}
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm transition duration-150 hover:-translate-y-1 hover:scale-110 hover:border-moss/35 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-moss/20"
              onClick={() => void openDefaultLink(group)}
              type="button"
            >
              {failedIconIds.has(group.id) ? (
                <span className="text-lg font-semibold uppercase text-moss">{group.displayName.slice(0, 1)}</span>
              ) : (
                <img
                  alt=""
                  className="h-8 w-8 rounded-md"
                  onError={() => setFailedIconIds((current) => new Set(current).add(group.id))}
                  src={group.iconUrl}
                />
              )}
            </button>
            <button
              aria-label={`管理 ${group.displayName}`}
              className="absolute right-0 top-0 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 opacity-0 shadow-sm transition hover:text-moss focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-moss/20 group-hover/link:opacity-100"
              onClick={() => setManagedGroupId(group.id)}
              type="button"
            >
              <MoreHorizontal aria-hidden="true" size={13} />
            </button>
            <span className="block w-full truncate text-center text-[11px] font-medium leading-4 text-slate-600" title={group.displayName}>
              {group.displayName}
            </span>
          </div>
        ))}
        <AddQuickLinkButton onClick={() => setAddOpen(true)} />
      </div>

      {addOpen ? <AddQuickLinkDialog onClose={() => setAddOpen(false)} onGroupsChange={setGroups} /> : null}
      {managedGroup ? (
        <ManageQuickLinkGroupDialog
          group={managedGroup}
          onClose={() => setManagedGroupId(null)}
          onGroupsChange={(nextGroups) => {
            setGroups(nextGroups);
            if (!nextGroups.some((group) => group.id === managedGroup.id)) {
              setManagedGroupId(null);
            }
          }}
          onRequestDelete={requestDelete}
        />
      ) : null}
      {pendingDelete ? <DeleteConfirmDialog onClose={() => setPendingDelete(null)} pendingDelete={pendingDelete} /> : null}
    </div>
  );
}

function AddQuickLinkButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      aria-label="新增网页导航"
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/80 text-slate-500 transition duration-150 hover:-translate-y-1 hover:scale-110 hover:border-moss/45 hover:bg-moss/10 hover:text-moss focus:outline-none focus:ring-2 focus:ring-moss/20"
      onClick={onClick}
      type="button"
    >
      <Plus aria-hidden="true" size={20} />
    </button>
  );
}

function AddQuickLinkDialog({ onClose, onGroupsChange }: { onClose: () => void; onGroupsChange: (groups: QuickLinkGroup[]) => void }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!url.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/quick-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, title })
      });
      const payload = (await response.json()) as Partial<QuickLinkResponse> & { error?: string };
      if (!response.ok || !payload.groups) {
        throw new Error(payload.error ?? "保存失败");
      }
      onGroupsChange(payload.groups);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogFrame labelledBy="quick-link-add-title">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-base font-semibold text-ink" id="quick-link-add-title">
          新增网页导航
        </h2>
        <CloseButton onClick={onClose} />
      </div>
      <div className="mt-4 grid gap-3">
        <label className="grid gap-1 text-xs font-semibold text-slate-600">
          URL
          <input
            aria-label="网页 URL"
            className="rounded-md border border-slate-200 px-3 py-2 text-sm text-ink outline-none focus:border-moss focus:ring-2 focus:ring-moss/20"
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com"
            value={url}
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">
          名称
          <input
            aria-label="网页名称"
            className="rounded-md border border-slate-200 px-3 py-2 text-sm text-ink outline-none focus:border-moss focus:ring-2 focus:ring-moss/20"
            onChange={(event) => setTitle(event.target.value)}
            placeholder="默认使用域名"
            value={title}
          />
        </label>
        {error ? <p className="text-xs text-danger-text">{error}</p> : null}
        <button
          className="inline-flex h-9 items-center justify-center rounded-md bg-ink px-3 text-sm font-semibold text-white disabled:opacity-50"
          disabled={saving || !url.trim()}
          onClick={() => void submit()}
          type="button"
        >
          保存
        </button>
      </div>
    </DialogFrame>
  );
}

function ManageQuickLinkGroupDialog({
  group,
  onClose,
  onGroupsChange,
  onRequestDelete
}: {
  group: QuickLinkGroup;
  onClose: () => void;
  onGroupsChange: (groups: QuickLinkGroup[]) => void;
  onRequestDelete: (message: string, action: () => Promise<void>) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(group.displayName);

  useEffect(() => {
    setDisplayName(group.displayName);
  }, [group.displayName]);

  async function updateGroupName() {
    const response = await fetch(`/api/quick-links/groups/${group.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName })
    });
    const payload = (await response.json()) as QuickLinkResponse;
    if (response.ok) onGroupsChange(payload.groups);
  }

  async function deleteGroup() {
    await onRequestDelete("确认删除这个网页入口？该 Logo 下的所有链接也会一并移除。", async () => {
      const response = await fetch(`/api/quick-links/groups/${group.id}`, { method: "DELETE" });
      const payload = (await response.json()) as QuickLinkResponse;
      if (response.ok) onGroupsChange(payload.groups);
    });
  }

  return (
    <DialogFrame labelledBy="quick-link-manage-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink" id="quick-link-manage-title">
            {group.domain}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">点击 Logo 会打开默认链接</p>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      <div className="mt-4 grid gap-2">
        <label className="grid gap-1 text-xs font-semibold text-slate-600">
          Logo 名称
          <div className="flex gap-2">
            <input
              aria-label="Logo 名称"
              className="min-w-0 flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm text-ink outline-none focus:border-moss focus:ring-2 focus:ring-moss/20"
              onChange={(event) => setDisplayName(event.target.value)}
              value={displayName}
            />
            <button className="rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-600" onClick={() => void updateGroupName()} type="button">
              保存
            </button>
          </div>
        </label>
        <div className="custom-scrollbar mt-2 grid max-h-80 gap-2 overflow-y-auto pr-1">
          {group.links.map((link) => (
            <QuickLinkEditor
              group={group}
              key={link.id}
              link={link}
              onGroupsChange={onGroupsChange}
              onRequestDelete={onRequestDelete}
            />
          ))}
        </div>
        <button className="mt-1 inline-flex h-8 items-center justify-center gap-1 rounded-md border border-danger px-3 text-xs font-semibold text-danger-text" onClick={() => void deleteGroup()} type="button">
          <Trash2 aria-hidden="true" size={13} />
          删除入口
        </button>
      </div>
    </DialogFrame>
  );
}

function QuickLinkEditor({
  group,
  link,
  onGroupsChange,
  onRequestDelete
}: {
  group: QuickLinkGroup;
  link: QuickLink;
  onGroupsChange: (groups: QuickLinkGroup[]) => void;
  onRequestDelete: (message: string, action: () => Promise<void>) => Promise<void>;
}) {
  const [title, setTitle] = useState(link.title);
  const [url, setUrl] = useState(link.url);
  const isDefault = group.defaultLinkId === link.id;

  useEffect(() => {
    setTitle(link.title);
    setUrl(link.url);
  }, [link.title, link.url]);

  async function saveLink() {
    const response = await fetch(`/api/quick-links/${link.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, url })
    });
    const payload = (await response.json()) as QuickLinkResponse;
    if (response.ok) onGroupsChange(payload.groups);
  }

  async function setDefault() {
    const response = await fetch(`/api/quick-links/${link.id}/default`, { method: "POST" });
    const payload = (await response.json()) as QuickLinkResponse;
    if (response.ok) onGroupsChange(payload.groups);
  }

  async function deleteLink() {
    const message =
      group.links.length === 1
        ? "确认删除这个网页入口？该 Logo 也会一并移除。"
        : isDefault
          ? "确认删除默认链接？删除后会自动选择同组其他链接作为默认。"
          : "确认删除这个链接？";
    await onRequestDelete(message, async () => {
      const response = await fetch(`/api/quick-links/${link.id}`, { method: "DELETE" });
      const payload = (await response.json()) as QuickLinkResponse;
      if (response.ok) onGroupsChange(payload.groups);
    });
  }

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${isDefault ? "text-moss" : "text-slate-500"}`}>
          {isDefault ? <Star aria-hidden="true" size={12} /> : null}
          {isDefault ? "默认" : "链接"}
        </span>
        <button className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-moss" onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")} type="button">
          <ExternalLink aria-hidden="true" size={12} />
          打开
        </button>
      </div>
      <div className="grid gap-2">
        <input
          aria-label={`链接名称 ${link.title}`}
          className="rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-moss focus:ring-2 focus:ring-moss/20"
          onChange={(event) => setTitle(event.target.value)}
          value={title}
        />
        <input
          aria-label={`链接 URL ${link.title}`}
          className="rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-moss focus:ring-2 focus:ring-moss/20"
          onChange={(event) => setUrl(event.target.value)}
          value={url}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="rounded-md bg-ink px-2 py-1 text-xs font-semibold text-white" onClick={() => void saveLink()} type="button">
          保存
        </button>
        <button className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 disabled:opacity-50" disabled={isDefault} onClick={() => void setDefault()} type="button">
          设为默认
        </button>
        <button className="rounded-md border border-danger px-2 py-1 text-xs font-semibold text-danger-text" onClick={() => void deleteLink()} type="button">
          删除
        </button>
      </div>
    </div>
  );
}

function DeleteConfirmDialog({
  pendingDelete,
  onClose
}: {
  pendingDelete: { message: string; action: () => Promise<void> };
  onClose: () => void;
}) {
  const [skipToday, setSkipToday] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function confirm() {
    setDeleting(true);
    try {
      if (skipToday) {
        window.localStorage.setItem(DELETE_SKIP_STORAGE_KEY, getTodayKey());
      }
      await pendingDelete.action();
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <DialogFrame labelledBy="quick-link-delete-title">
      <h2 className="text-base font-semibold text-ink" id="quick-link-delete-title">
        删除确认
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{pendingDelete.message}</p>
      <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
        <input checked={skipToday} onChange={(event) => setSkipToday(event.target.checked)} type="checkbox" />
        今日不再提醒
      </label>
      <div className="mt-4 flex justify-end gap-2">
        <button className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600" onClick={onClose} type="button">
          取消
        </button>
        <button className="rounded-md bg-danger px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50" disabled={deleting} onClick={() => void confirm()} type="button">
          确认删除
        </button>
      </div>
    </DialogFrame>
  );
}

function DialogFrame({ children, labelledBy }: { children: ReactNode; labelledBy: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4 py-6">
      <section
        aria-labelledby={labelledBy}
        aria-modal="true"
        className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-4 shadow-xl"
        role="dialog"
      >
        {children}
      </section>
    </div>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50" onClick={onClick} type="button">
      关闭
    </button>
  );
}

function shouldSkipDeleteConfirmToday(): boolean {
  try {
    return window.localStorage.getItem(DELETE_SKIP_STORAGE_KEY) === getTodayKey();
  } catch {
    return false;
  }
}

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
