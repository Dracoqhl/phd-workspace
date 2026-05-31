"use client";

import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ExternalLink, MoreHorizontal, Plus, Settings2, Star, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import type { QuickLink, QuickLinkGroup } from "@/types/quick-link";

interface QuickLinkResponse {
  groups: QuickLinkGroup[];
}

const DELETE_SKIP_STORAGE_KEY = "phd-workspace-quick-link-delete-skip-date";
const MAX_VISIBLE_GROUPS = 8;

export function QuickLinkDock() {
  const [groups, setGroups] = useState<QuickLinkGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [dockStartIndex, setDockStartIndex] = useState(0);
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
  const hasLoop = groups.length > MAX_VISIBLE_GROUPS;
  const visibleGroups = useMemo(() => getVisibleGroups(groups, dockStartIndex), [groups, dockStartIndex]);

  useEffect(() => {
    if (groups.length === 0) {
      setDockStartIndex(0);
    } else if (dockStartIndex >= groups.length) {
      setDockStartIndex(0);
    }
  }, [dockStartIndex, groups.length]);

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

  function loopDock(direction: -1 | 1) {
    if (!hasLoop) return;
    setDockStartIndex((current) => (current + direction + groups.length) % groups.length);
  }

  async function saveGroupOrder(nextGroups: QuickLinkGroup[]) {
    setGroups(nextGroups);

    const response = await fetch("/api/quick-links/groups/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupIds: nextGroups.map((group) => group.id) })
    });
    const payload = (await response.json()) as Partial<QuickLinkResponse>;
    if (response.ok && payload.groups) {
      setGroups(payload.groups);
    }
  }

  async function moveGroup(groupId: string, direction: -1 | 1) {
    const index = groups.findIndex((group) => group.id === groupId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= groups.length) return;

    const nextGroups = [...groups];
    [nextGroups[index], nextGroups[targetIndex]] = [nextGroups[targetIndex], nextGroups[index]];
    await saveGroupOrder(nextGroups);
  }

  if (!loading && groups.length === 0) {
    return (
      <div className="relative">
        <div className="flex justify-center py-1">
          <AddQuickLinkButton onClick={() => setAddOpen(true)} />
        </div>
        {addOpen ? <AddQuickLinkDialog onClose={() => setAddOpen(false)} onGroupsChange={setGroups} /> : null}
        {pendingDelete ? <DeleteConfirmDialog onClose={() => setPendingDelete(null)} pendingDelete={pendingDelete} /> : null}
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        className="relative flex min-h-[84px] items-center justify-center gap-2 overflow-visible px-9 py-2"
        onWheel={(event) => {
          if (!hasLoop) return;
          const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
          if (Math.abs(delta) < 12) return;
          loopDock(delta > 0 ? 1 : -1);
        }}
      >
        <svg aria-hidden="true" className="pointer-events-none absolute left-10 right-10 top-[52px] h-8 text-line/80" preserveAspectRatio="none" viewBox="0 0 100 32">
          <path d="M3 20 C22 31 78 31 97 20" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
          <path d="M12 18 C30 25 70 25 88 18" fill="none" stroke="currentColor" opacity="0.28" strokeLinecap="round" strokeWidth="4" />
        </svg>
        {hasLoop ? <DockLoopButton direction="left" onClick={() => loopDock(-1)} /> : null}
        {visibleGroups.map((group) => (
          <div
            className="group/link relative z-10 flex w-[66px] shrink-0 flex-col items-center"
            key={group.id}
          >
            <button
              aria-label={`打开 ${group.displayName}`}
              className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface shadow-sm ring-1 ring-slate-200/70 transition duration-150 hover:-translate-y-1 hover:scale-110 hover:shadow-md hover:ring-moss/30 focus:outline-none focus:ring-2 focus:ring-moss/25"
              onClick={() => void openDefaultLink(group)}
              type="button"
            >
              {failedIconIds.has(group.id) ? (
                <span className="text-lg font-semibold uppercase text-moss">{group.displayName.slice(0, 1)}</span>
              ) : (
                <img
                  alt=""
                  className="h-[52px] w-[52px] rounded-[14px] object-cover"
                  onError={() => setFailedIconIds((current) => new Set(current).add(group.id))}
                  src={getQuickLinkIconSrc(group)}
                />
              )}
            </button>
            <button
              aria-label={`管理 ${group.displayName}`}
              className="absolute right-1 top-0 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 opacity-0 shadow-sm transition hover:text-moss focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-moss/20 group-hover/link:opacity-100"
              onClick={() => setManagedGroupId(group.id)}
              type="button"
            >
              <MoreHorizontal aria-hidden="true" size={13} />
            </button>
            <div className="pointer-events-none absolute left-1/2 top-[62px] z-40 w-52 -translate-x-1/2 rounded-lg border border-slate-200 bg-surface p-1.5 opacity-0 shadow-lg transition group-hover/link:pointer-events-auto group-hover/link:opacity-100 group-focus-within/link:pointer-events-auto group-focus-within/link:opacity-100">
              {group.links.map((link) => (
                <button
                  className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-xs font-semibold text-ink transition hover:bg-surface-muted"
                  key={link.id}
                  onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")}
                  type="button"
                >
                  <span className="min-w-0 truncate">{link.title}</span>
                  {group.defaultLinkId === link.id ? <Star aria-hidden="true" className="shrink-0 text-moss" size={12} /> : null}
                </button>
              ))}
            </div>
          </div>
        ))}
        <AddQuickLinkButton onClick={() => setAddOpen(true)} />
        {hasLoop ? <DockLoopButton direction="right" onClick={() => loopDock(1)} /> : null}
        {groups.length > 1 ? <OrderQuickLinksButton onClick={() => setOrderOpen(true)} /> : null}
      </div>

      {addOpen ? <AddQuickLinkDialog onClose={() => setAddOpen(false)} onGroupsChange={setGroups} /> : null}
      {orderOpen ? <OrderQuickLinkGroupsDialog groups={groups} onClose={() => setOrderOpen(false)} onMoveGroup={moveGroup} /> : null}
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

function getVisibleGroups(groups: QuickLinkGroup[], startIndex: number): QuickLinkGroup[] {
  if (groups.length <= MAX_VISIBLE_GROUPS) return groups;
  return Array.from({ length: MAX_VISIBLE_GROUPS }, (_, index) => groups[(startIndex + index) % groups.length]);
}

function DockLoopButton({ direction, onClick }: { direction: "left" | "right"; onClick: () => void }) {
  const Icon = direction === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      aria-label={direction === "left" ? "向左循环网页导航" : "向右循环网页导航"}
      className={`absolute top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-muted shadow-sm transition hover:border-moss/40 hover:text-moss focus:outline-none focus:ring-2 focus:ring-moss/20 ${
        direction === "left" ? "left-0" : "right-0"
      }`}
      onClick={onClick}
      type="button"
    >
      <Icon aria-hidden="true" size={16} />
    </button>
  );
}

function OrderQuickLinksButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      aria-label="整理网页导航顺序"
      className="absolute right-8 top-0 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface text-muted shadow-sm transition hover:border-moss/40 hover:text-moss focus:outline-none focus:ring-2 focus:ring-moss/20"
      onClick={onClick}
      type="button"
    >
      <Settings2 aria-hidden="true" size={14} />
    </button>
  );
}

function AddQuickLinkButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      aria-label="新增网页导航"
      className="z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-surface text-slate-500 transition duration-150 hover:-translate-y-1 hover:scale-110 hover:border-moss/35 hover:bg-moss/10 hover:text-moss focus:outline-none focus:ring-2 focus:ring-moss/25"
      onClick={onClick}
      type="button"
    >
      <Plus aria-hidden="true" size={20} />
    </button>
  );
}

function getQuickLinkIconSrc(group: QuickLinkGroup): string {
  return `/api/quick-links/icon?domain=${encodeURIComponent(group.domain)}`;
}

function OrderQuickLinkGroupsDialog({
  groups,
  onClose,
  onMoveGroup
}: {
  groups: QuickLinkGroup[];
  onClose: () => void;
  onMoveGroup: (groupId: string, direction: -1 | 1) => Promise<void>;
}) {
  return (
    <DialogFrame labelledBy="quick-link-order-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink" id="quick-link-order-title">
            整理网页导航
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">用上下移动调整显示顺序</p>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      <div className="mt-4 grid gap-2">
        {groups.map((group, index) => (
          <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-muted px-2 py-2" key={group.id}>
            <img alt="" className="h-8 w-8 rounded-lg object-cover" src={getQuickLinkIconSrc(group)} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{group.displayName}</p>
              <p className="truncate text-xs text-muted">{group.domain}</p>
            </div>
            <button
              aria-label={`上移 ${group.displayName}`}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface text-muted transition hover:text-moss disabled:opacity-35"
              disabled={index === 0}
              onClick={() => void onMoveGroup(group.id, -1)}
              type="button"
            >
              <ArrowUp aria-hidden="true" size={15} />
            </button>
            <button
              aria-label={`下移 ${group.displayName}`}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface text-muted transition hover:text-moss disabled:opacity-35"
              disabled={index === groups.length - 1}
              onClick={() => void onMoveGroup(group.id, 1)}
              type="button"
            >
              <ArrowDown aria-hidden="true" size={15} />
            </button>
          </div>
        ))}
      </div>
    </DialogFrame>
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
