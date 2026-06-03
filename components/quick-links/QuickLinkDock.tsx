"use client";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleDot,
  Copy,
  ExternalLink,
  GripVertical,
  ImagePlus,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Settings2,
  Star,
  Trash2
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, KeyboardEvent } from "react";

import type { QuickLink, QuickLinkGroup } from "@/types/quick-link";

interface QuickLinkResponse {
  groups: QuickLinkGroup[];
}

const DELETE_SKIP_STORAGE_KEY = "phd-workspace-quick-link-delete-skip-date";
const MAX_VISIBLE_GROUPS = 8;
const CUSTOM_ICON_MAX_BYTES = 512 * 1024;
const CUSTOM_ICON_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"]);
const QUICK_LINK_TITLE_GUIDANCE =
  "部分网站会阻止服务器读取页面标题，子网页名称可能只能显示为域名或路径。现在可以在这里手动改成更好识别的名称；后续会上线浏览器插件，从你已打开的页面直接带回标题和简短说明。";
const QUICK_LINK_GROUP_GUIDANCE =
  "当前部分网页标题无法稳定自动抓取，建议手动补充子网页名称。后续浏览器插件会从已打开页面带回标题和简介，让导航内容更容易识别。";

export function QuickLinkDock() {
  const [groups, setGroups] = useState<QuickLinkGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [dockStartIndex, setDockStartIndex] = useState(0);
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);
  const [draggingLinkId, setDraggingLinkId] = useState<string | null>(null);
  const [groupDropTarget, setGroupDropTarget] = useState<{ groupId: string; placement: "before" | "after" } | null>(null);
  const [linkDropTarget, setLinkDropTarget] = useState<{ linkId: string; placement: "before" | "after" } | null>(null);
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
        if (active) applyGroups(payload.groups);
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

  function applyGroups(nextGroups: QuickLinkGroup[]) {
    setGroups(nextGroups);
    setFailedIconIds((current) => {
      const next = new Set(current);
      nextGroups.forEach((group) => {
        if (isCustomQuickLinkIcon(group.iconUrl)) next.delete(group.id);
      });
      return next;
    });
  }

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
      applyGroups(payload.groups);
    }
  }

  async function reorderGroups(draggedGroupId: string, targetGroupId: string, placement: "before" | "after") {
    if (draggedGroupId === targetGroupId) return;

    const groupIds = groups.map((group) => group.id).filter((groupId) => groupId !== draggedGroupId);
    const targetIndex = groupIds.indexOf(targetGroupId);
    if (targetIndex < 0) return;

    groupIds.splice(placement === "before" ? targetIndex : targetIndex + 1, 0, draggedGroupId);
    const nextGroups = groupIds.map((groupId, index) => {
      const group = groups.find((candidate) => candidate.id === groupId);
      if (!group) throw new Error("Quick link group order is inconsistent.");
      return { ...group, sortOrder: index };
    });
    await saveGroupOrder(nextGroups);
  }

  async function updateLink(link: QuickLink, title: string, url: string) {
    const response = await fetch(`/api/quick-links/${link.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, url })
    });
    const payload = (await response.json()) as Partial<QuickLinkResponse>;
    if (response.ok && payload.groups) {
      applyGroups(payload.groups);
    }
  }

  async function setDefaultLink(linkId: string) {
    const previousGroups = groups;
    let targetGroupId: string | null = null;
    const nextGroups = groups.map((group) => {
      if (!group.links.some((link) => link.id === linkId)) return group;
      targetGroupId = group.id;
      return { ...group, defaultLinkId: linkId };
    });
    if (!targetGroupId) return;

    setGroups(nextGroups);
    try {
      const response = await fetch(`/api/quick-links/${linkId}/default`, { method: "POST" });
      const payload = (await response.json()) as Partial<QuickLinkResponse>;
      if (response.ok && payload.groups) {
        applyGroups(payload.groups);
      } else {
        setGroups(previousGroups);
      }
    } catch {
      setGroups(previousGroups);
    }
  }

  async function deleteLink(link: QuickLink) {
    await requestDelete("确认删除这个子网页？如果这是该域名下最后一个子网页，域名入口也会一并移除。", async () => {
      const response = await fetch(`/api/quick-links/${link.id}`, { method: "DELETE" });
      const payload = (await response.json()) as Partial<QuickLinkResponse>;
      if (response.ok && payload.groups) {
        applyGroups(payload.groups);
      }
    });
  }

  async function reorderLinks(groupId: string, draggedLinkId: string, targetLinkId: string, placement: "before" | "after") {
    if (draggedLinkId === targetLinkId) return;
    const group = groups.find((candidate) => candidate.id === groupId);
    if (!group) return;

    const linkIds = group.links.map((link) => link.id).filter((linkId) => linkId !== draggedLinkId);
    const targetIndex = linkIds.indexOf(targetLinkId);
    if (targetIndex < 0) return;

    linkIds.splice(placement === "before" ? targetIndex : targetIndex + 1, 0, draggedLinkId);
    const nextGroups = groups.map((candidate) =>
      candidate.id === groupId
        ? {
            ...candidate,
            links: linkIds.map((linkId, index) => {
              const link = group.links.find((candidateLink) => candidateLink.id === linkId);
              if (!link) throw new Error("Quick link order is inconsistent.");
              return { ...link, sortOrder: index };
            })
          }
        : candidate
    );
    setGroups(nextGroups);

    const response = await fetch(`/api/quick-links/groups/${groupId}/links/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkIds })
    });
    const payload = (await response.json()) as Partial<QuickLinkResponse>;
    if (response.ok && payload.groups) {
      applyGroups(payload.groups);
    }
  }

  if (!loading && groups.length === 0) {
    return (
      <div className="relative">
        <div className="flex justify-center py-1">
          <AddQuickLinkButton onClick={() => setAddOpen(true)} />
        </div>
        {addOpen ? <AddQuickLinkDialog onClose={() => setAddOpen(false)} onGroupsChange={applyGroups} /> : null}
        {pendingDelete ? <DeleteConfirmDialog onClose={() => setPendingDelete(null)} pendingDelete={pendingDelete} /> : null}
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        className="relative flex min-h-[74px] items-center justify-center gap-2 overflow-visible px-9 py-2"
        onWheel={(event) => {
          if (!hasLoop) return;
          const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
          if (Math.abs(delta) < 12) return;
          loopDock(delta > 0 ? 1 : -1);
        }}
      >
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
              className="absolute right-0 top-0 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 opacity-0 shadow-sm transition hover:text-moss focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-moss/20 group-hover/link:opacity-100"
              onClick={() => setManagedGroupId(group.id)}
              type="button"
            >
              <MoreHorizontal aria-hidden="true" size={13} />
            </button>
            <div className="pointer-events-none absolute left-1/2 top-[54px] z-40 w-56 -translate-x-1/2 pt-2 opacity-0 transition group-hover/link:pointer-events-auto group-hover/link:opacity-100 group-focus-within/link:pointer-events-auto group-focus-within/link:opacity-100">
              <div className="rounded-lg border border-slate-200 bg-surface p-1.5 shadow-lg">
              {group.links.map((link) => (
                <button
                  aria-label={`打开子网页 ${getQuickLinkTitle(link)}`}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-xs font-semibold text-ink transition hover:bg-surface-muted"
                  key={link.id}
                  onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")}
                  title={link.url}
                  type="button"
                >
                  <span className="min-w-0 truncate">{getQuickLinkTitle(link)}</span>
                  {group.defaultLinkId === link.id ? <Star aria-hidden="true" className="shrink-0 text-moss" size={12} /> : null}
                </button>
              ))}
              </div>
            </div>
          </div>
        ))}
        <AddQuickLinkButton onClick={() => setAddOpen(true)} />
        {hasLoop ? <DockLoopButton direction="right" onClick={() => loopDock(1)} /> : null}
        {groups.length > 0 ? <OrderQuickLinksButton onClick={() => setOrderOpen(true)} /> : null}
      </div>

      {addOpen ? <AddQuickLinkDialog onClose={() => setAddOpen(false)} onGroupsChange={applyGroups} /> : null}
      {orderOpen ? (
        <OrderQuickLinkGroupsDialog
          draggingGroupId={draggingGroupId}
          draggingLinkId={draggingLinkId}
          groupDropTarget={groupDropTarget}
          groups={groups}
          linkDropTarget={linkDropTarget}
          onClose={() => setOrderOpen(false)}
          onDeleteLink={(link) => void deleteLink(link)}
          onGroupDragEnd={() => {
            setDraggingGroupId(null);
            setGroupDropTarget(null);
          }}
          onGroupDragOver={(event, targetGroup) => {
            if (!draggingGroupId || draggingGroupId === targetGroup.id) return;
            event.preventDefault();
            const placement = getDropPlacement(event.currentTarget, event.clientY);
            setGroupDropTarget({ groupId: targetGroup.id, placement });
          }}
          onGroupDragStart={(event, groupId) => {
            event.dataTransfer?.setData("text/plain", groupId);
            if (event.dataTransfer) {
              event.dataTransfer.effectAllowed = "move";
            }
            setDraggingGroupId(groupId);
            setGroupDropTarget(null);
          }}
          onGroupDrop={(event, targetGroup) => {
            event.preventDefault();
            if (!draggingGroupId) return;
            const draggedGroupId = event.dataTransfer.getData("text/plain") || draggingGroupId;
            const placement = groupDropTarget?.groupId === targetGroup.id ? groupDropTarget.placement : getDropPlacement(event.currentTarget, event.clientY);
            setDraggingGroupId(null);
            setGroupDropTarget(null);
            if (draggedGroupId) void reorderGroups(draggedGroupId, targetGroup.id, placement);
          }}
          onLinkDragEnd={() => {
            setDraggingLinkId(null);
            setLinkDropTarget(null);
          }}
          onLinkDragOver={(event, targetLink) => {
            if (!draggingLinkId || draggingLinkId === targetLink.id) return;
            event.preventDefault();
            const placement = getDropPlacement(event.currentTarget, event.clientY);
            setLinkDropTarget({ linkId: targetLink.id, placement });
          }}
          onLinkDragStart={(event, linkId) => {
            event.dataTransfer?.setData("text/plain", linkId);
            if (event.dataTransfer) {
              event.dataTransfer.effectAllowed = "move";
            }
            setDraggingLinkId(linkId);
            setLinkDropTarget(null);
          }}
          onLinkDrop={(event, group, targetLink) => {
            event.preventDefault();
            event.stopPropagation();
            const draggedLinkId = event.dataTransfer.getData("text/plain") || draggingLinkId;
            const placement = linkDropTarget?.linkId === targetLink.id ? linkDropTarget.placement : getDropPlacement(event.currentTarget, event.clientY);
            setDraggingLinkId(null);
            setLinkDropTarget(null);
            if (draggedLinkId) void reorderLinks(group.id, draggedLinkId, targetLink.id, placement);
          }}
          onLinkListDrop={(event, group) => {
            event.preventDefault();
            event.stopPropagation();
            if (!draggingLinkId || !linkDropTarget) return;
            const targetLink = group.links.find((link) => link.id === linkDropTarget.linkId);
            if (!targetLink) return;
            const draggedLinkId = event.dataTransfer.getData("text/plain") || draggingLinkId;
            setDraggingLinkId(null);
            setLinkDropTarget(null);
            if (draggedLinkId) void reorderLinks(group.id, draggedLinkId, targetLink.id, linkDropTarget.placement);
          }}
          onSetDefaultLink={(linkId) => void setDefaultLink(linkId)}
          onUpdateLink={(link, title, url) => void updateLink(link, title, url)}
        />
      ) : null}
      {managedGroup ? (
        <ManageQuickLinkGroupDialog
          group={managedGroup}
          onClose={() => setManagedGroupId(null)}
          onGroupsChange={(nextGroups) => {
            applyGroups(nextGroups);
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
  if (isCustomQuickLinkIcon(group.iconUrl)) return group.iconUrl;
  return `/api/quick-links/icon?domain=${encodeURIComponent(group.domain)}`;
}

function isCustomQuickLinkIcon(iconUrl: string): boolean {
  return iconUrl.trim().toLowerCase().startsWith("data:image/");
}

function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Invalid image data"));
      }
    });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Failed to read image")));
    reader.readAsDataURL(file);
  });
}

function getQuickLinkTitle(link: QuickLink): string {
  return link.title.trim() || getQuickLinkUrlLabel(link.url);
}

function getQuickLinkUrlLabel(value: string): string {
  try {
    const url = new URL(value);
    const path = `${url.pathname}${url.search}${url.hash}`;
    return path && path !== "/" ? path : url.href;
  } catch {
    return value;
  }
}

function getDropPlacement(element: HTMLElement, clientY: number): "before" | "after" {
  const rect = element.getBoundingClientRect();
  return clientY < rect.top + rect.height / 2 ? "before" : "after";
}

function OrderQuickLinkGroupsDialog({
  draggingGroupId,
  draggingLinkId,
  groupDropTarget,
  groups,
  linkDropTarget,
  onClose,
  onDeleteLink,
  onGroupDragEnd,
  onGroupDragOver,
  onGroupDragStart,
  onGroupDrop,
  onLinkDragEnd,
  onLinkDragOver,
  onLinkDragStart,
  onLinkDrop,
  onLinkListDrop,
  onSetDefaultLink,
  onUpdateLink
}: {
  draggingGroupId: string | null;
  draggingLinkId: string | null;
  groupDropTarget: { groupId: string; placement: "before" | "after" } | null;
  groups: QuickLinkGroup[];
  linkDropTarget: { linkId: string; placement: "before" | "after" } | null;
  onClose: () => void;
  onDeleteLink: (link: QuickLink) => void;
  onGroupDragEnd: () => void;
  onGroupDragOver: (event: DragEvent<HTMLDivElement>, targetGroup: QuickLinkGroup) => void;
  onGroupDragStart: (event: DragEvent<HTMLButtonElement>, groupId: string) => void;
  onGroupDrop: (event: DragEvent<HTMLDivElement>, targetGroup: QuickLinkGroup) => void;
  onLinkDragEnd: () => void;
  onLinkDragOver: (event: DragEvent<HTMLDivElement>, targetLink: QuickLink) => void;
  onLinkDragStart: (event: DragEvent<HTMLButtonElement>, linkId: string) => void;
  onLinkDrop: (event: DragEvent<HTMLDivElement>, group: QuickLinkGroup, targetLink: QuickLink) => void;
  onLinkListDrop: (event: DragEvent<HTMLDivElement>, group: QuickLinkGroup) => void;
  onSetDefaultLink: (linkId: string) => void;
  onUpdateLink: (link: QuickLink, title: string, url: string) => void;
}) {
  return (
    <DialogFrame labelledBy="quick-link-order-title" maxWidth="max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink" id="quick-link-order-title">
            整理网页导航
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">{QUICK_LINK_TITLE_GUIDANCE}</p>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      <div className="custom-scrollbar mt-4 grid max-h-[62vh] gap-3 overflow-y-auto pr-1">
        {groups.map((group) => {
          const groupIndicatorClass =
            groupDropTarget?.groupId === group.id && groupDropTarget.placement === "before"
              ? "before:absolute before:left-2 before:right-2 before:top-0 before:h-0.5 before:rounded-full before:bg-moss"
              : groupDropTarget?.groupId === group.id && groupDropTarget.placement === "after"
                ? "after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:rounded-full after:bg-moss"
                : "";

          return (
            <div
              className={`relative rounded-lg border border-line bg-surface-muted p-2 transition ${groupIndicatorClass} ${draggingGroupId === group.id ? "opacity-60" : ""}`}
              key={group.id}
              onDragOver={(event) => onGroupDragOver(event, group)}
              onDrop={(event) => onGroupDrop(event, group)}
            >
              <div className="flex items-center gap-3">
                <button
                  aria-label={`拖动域名 ${group.displayName}`}
                  className="inline-flex h-8 w-8 cursor-grab items-center justify-center rounded-md text-action-muted active:cursor-grabbing"
                  draggable
                  onDragEnd={onGroupDragEnd}
                  onDragStart={(event) => onGroupDragStart(event, group.id)}
                  type="button"
                >
                  <GripVertical aria-hidden="true" size={15} />
                </button>
                <img alt="" className="h-9 w-9 rounded-xl object-cover" src={getQuickLinkIconSrc(group)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{group.displayName}</p>
                  <p className="truncate text-xs text-muted">{group.domain}</p>
                </div>
              </div>
              <div
                className="mt-2 grid gap-1"
                onDragOver={(event) => {
                  if (draggingLinkId && linkDropTarget && group.links.some((link) => link.id === linkDropTarget.linkId)) {
                    event.preventDefault();
                  }
                }}
                onDrop={(event) => onLinkListDrop(event, group)}
              >
                {group.links.map((link) => (
                  <QuickLinkOrderRow
                    dragging={draggingLinkId === link.id}
                    dropPlacement={linkDropTarget?.linkId === link.id ? linkDropTarget.placement : null}
                    group={group}
                    key={link.id}
                    link={link}
                    onDelete={onDeleteLink}
                    onDragEnd={onLinkDragEnd}
                    onDragOver={onLinkDragOver}
                    onDragStart={onLinkDragStart}
                    onDrop={onLinkDrop}
                    onSetDefault={onSetDefaultLink}
                    onUpdate={onUpdateLink}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </DialogFrame>
  );
}

function QuickLinkOrderRow({
  dragging,
  dropPlacement,
  group,
  link,
  onDelete,
  onDragEnd,
  onDragOver,
  onDragStart,
  onDrop,
  onSetDefault,
  onUpdate
}: {
  dragging: boolean;
  dropPlacement: "before" | "after" | null;
  group: QuickLinkGroup;
  link: QuickLink;
  onDelete: (link: QuickLink) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLDivElement>, targetLink: QuickLink) => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>, linkId: string) => void;
  onDrop: (event: DragEvent<HTMLDivElement>, group: QuickLinkGroup, targetLink: QuickLink) => void;
  onSetDefault: (linkId: string) => void;
  onUpdate: (link: QuickLink, title: string, url: string) => void;
}) {
  const [title, setTitle] = useState(link.title);
  const [url, setUrl] = useState(link.url);
  const [copied, setCopied] = useState(false);
  const skipNextSaveRef = useRef(false);
  const isDefault = group.defaultLinkId === link.id;

  useEffect(() => {
    setTitle(link.title);
    setUrl(link.url);
  }, [link.title, link.url]);

  const indicatorClass =
    dropPlacement === "before"
      ? "before:absolute before:left-2 before:right-2 before:top-0 before:h-0.5 before:rounded-full before:bg-moss"
      : dropPlacement === "after"
        ? "after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:rounded-full after:bg-moss"
        : "";

  async function copyUrl() {
    try {
      await navigator.clipboard?.writeText(link.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard permissions are browser-dependent; failing silently keeps editing uninterrupted.
    }
  }

  function saveIfChanged(nextTitle = title, nextUrl = url) {
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    const normalizedTitle = nextTitle.trim();
    const normalizedUrl = nextUrl.trim();
    if (!normalizedTitle || !normalizedUrl) {
      setTitle(link.title);
      setUrl(link.url);
      return;
    }
    if (normalizedTitle === link.title && normalizedUrl === link.url) return;
    onUpdate(link, normalizedTitle, normalizedUrl);
  }

  function handleEditKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      skipNextSaveRef.current = true;
      setTitle(link.title);
      setUrl(link.url);
      event.currentTarget.blur();
    }
  }

  const defaultStateClass = isDefault ? "border-moss/30 bg-moss/10 ring-1 ring-moss/15" : "bg-surface";

  return (
    <div
      className={`relative rounded-md border border-transparent px-2 py-2 text-xs transition ${defaultStateClass} ${indicatorClass} ${dragging ? "opacity-60" : ""}`}
      onDragOver={(event) => onDragOver(event, link)}
      onDrop={(event) => onDrop(event, group, link)}
    >
      <div className="grid min-w-0 grid-cols-[auto_auto_minmax(6rem,0.75fr)_minmax(12rem,1.4fr)_auto] items-center gap-2">
        <button
          aria-label={isDefault ? `当前首选 ${getQuickLinkTitle(link)}` : `设为首选 ${getQuickLinkTitle(link)}`}
          className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition ${
            isDefault ? "border-moss/35 bg-moss/15 text-moss" : "border-line text-action-muted hover:border-moss/30 hover:text-moss"
          }`}
          disabled={isDefault}
          onClick={() => onSetDefault(link.id)}
          title={isDefault ? "当前首选" : "设为首选"}
          type="button"
        >
          {isDefault ? <CircleDot aria-hidden="true" size={14} /> : <Circle aria-hidden="true" size={14} />}
        </button>
        <button
          aria-label={`拖动子网站 ${getQuickLinkTitle(link)}`}
          className="inline-flex h-7 w-7 cursor-grab items-center justify-center rounded-md text-action-muted active:cursor-grabbing"
          draggable
          onDragEnd={onDragEnd}
          onDragStart={(event) => onDragStart(event, link.id)}
          type="button"
        >
          <GripVertical aria-hidden="true" size={13} />
        </button>
        <div className="flex min-w-0 items-center gap-1">
          <input
            aria-label={`子网站名称 ${getQuickLinkTitle(link)}`}
            className="min-w-0 flex-1 rounded-md border border-line bg-field px-2 py-1.5 text-xs font-semibold text-ink outline-none focus:border-moss focus:ring-2 focus:ring-moss/20"
            onBlur={() => saveIfChanged()}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={handleEditKeyDown}
            value={title}
          />
        </div>
        <input
          aria-label={`子网站 URL ${getQuickLinkTitle(link)}`}
          className="min-w-0 rounded-md border border-line bg-field px-2 py-1.5 text-xs text-muted outline-none focus:border-moss focus:ring-2 focus:ring-moss/20"
          onBlur={() => saveIfChanged()}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={handleEditKeyDown}
          title={link.url}
          value={url}
        />
        <div className="flex shrink-0 items-center gap-1">
          <button
            aria-label={copied ? `已复制子网站 ${getQuickLinkTitle(link)}` : `复制子网站 ${getQuickLinkTitle(link)}`}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition ${
              copied ? "border-moss/35 bg-moss/15 text-moss" : "border-line text-muted hover:text-moss"
            }`}
            onClick={() => void copyUrl()}
            title={copied ? "已复制" : "复制 URL"}
            type="button"
          >
            {copied ? <Check aria-hidden="true" size={13} /> : <Copy aria-hidden="true" size={12} />}
          </button>
          <button
            aria-label={`删除子网站 ${getQuickLinkTitle(link)}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-line text-action-muted transition hover:border-danger hover:bg-danger-soft hover:text-danger-text"
            onClick={() => onDelete(link)}
            title="删除"
            type="button"
          >
            <Trash2 aria-hidden="true" size={12} />
          </button>
        </div>
      </div>
    </div>
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
  const [iconError, setIconError] = useState<string | null>(null);
  const [iconSaving, setIconSaving] = useState(false);
  const usesCustomIcon = isCustomQuickLinkIcon(group.iconUrl);

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

  async function updateGroupIcon(iconUrl: string) {
    setIconSaving(true);
    setIconError(null);
    try {
      const response = await fetch(`/api/quick-links/groups/${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iconUrl })
      });
      const payload = (await response.json()) as Partial<QuickLinkResponse> & { error?: string };
      if (!response.ok || !payload.groups) throw new Error(payload.error ?? "Logo 保存失败");
      onGroupsChange(payload.groups);
    } catch (caught) {
      setIconError(caught instanceof Error ? caught.message : "Logo 保存失败");
    } finally {
      setIconSaving(false);
    }
  }

  async function handleIconUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;

    if (!CUSTOM_ICON_TYPES.has(file.type)) {
      setIconError("请上传 PNG、JPG、WebP 或 SVG 图片。");
      return;
    }
    if (file.size > CUSTOM_ICON_MAX_BYTES) {
      setIconError("Logo 图片不能超过 512KB。");
      return;
    }

    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      await updateGroupIcon(dataUrl);
    } catch {
      setIconError("Logo 读取失败，请换一张图片。");
    }
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
          <p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">{QUICK_LINK_GROUP_GUIDANCE}</p>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      <div className="mt-4 grid gap-2">
        <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-muted p-2">
          <img alt="" className="h-12 w-12 rounded-2xl bg-surface object-cover ring-1 ring-line" src={getQuickLinkIconSrc(group)} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-600">自定义 Logo</p>
            <p className="mt-0.5 text-xs text-muted">{usesCustomIcon ? "正在使用手动上传的图片。" : "未上传时自动尝试读取网站图标。"}</p>
          </div>
          <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-line bg-surface px-2.5 text-xs font-semibold text-slate-600 transition hover:border-moss/35 hover:text-moss">
            <ImagePlus aria-hidden="true" size={13} />
            上传
            <input accept="image/png,image/jpeg,image/webp,image/svg+xml" aria-label="上传自定义 Logo" className="sr-only" onChange={(event) => void handleIconUpload(event)} type="file" />
          </label>
          <button
            className="inline-flex h-8 items-center gap-1 rounded-md border border-line bg-surface px-2.5 text-xs font-semibold text-slate-600 transition hover:border-moss/35 hover:text-moss disabled:opacity-50"
            disabled={!usesCustomIcon || iconSaving}
            onClick={() => void updateGroupIcon("")}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={13} />
            自动获取
          </button>
        </div>
        {iconError ? <p className="text-xs text-danger-text">{iconError}</p> : null}
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

function DialogFrame({ children, labelledBy, maxWidth = "max-w-lg" }: { children: ReactNode; labelledBy: string; maxWidth?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4 py-6">
      <section
        aria-labelledby={labelledBy}
        aria-modal="true"
        className={`w-full ${maxWidth} rounded-lg border border-slate-200 bg-white p-4 shadow-xl`}
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
