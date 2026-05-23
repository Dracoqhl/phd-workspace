import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuickNotesPanel } from "@/components/notes/QuickNotesPanel";
import type { QuickNote } from "@/types/note";

const baseTime = "2026-05-21T02:00:00.000Z";

function note(overrides: Partial<QuickNote> = {}): QuickNote {
  return {
    id: "note_1",
    tag: "",
    title: "",
    content: "",
    createdAt: baseTime,
    updatedAt: baseTime,
    ...overrides
  };
}

function parseBody(init?: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
}

function mockFetch(initialNotes: QuickNote[]) {
  let notes = [...initialNotes];
  let createCount = 0;

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url === "/api/notes" && method === "GET") {
      return Response.json({ notes });
    }

    if (url === "/api/notes" && method === "POST") {
      createCount += 1;
      const created = note({
        id: `note_new_${createCount}`,
        createdAt: `2026-05-21T02:0${createCount}:00.000Z`,
        updatedAt: `2026-05-21T02:0${createCount}:00.000Z`
      });
      notes = [created, ...notes];
      return Response.json({ note: created }, { status: 201 });
    }

    if (url.startsWith("/api/notes/") && method === "PATCH") {
      const id = url.split("/").at(-1) ?? "";
      const body = parseBody(init) as Partial<QuickNote>;
      const updated = note({
        ...notes.find((item) => item.id === id),
        id,
        tag: body.tag,
        title: body.title,
        content: body.content,
        updatedAt: "2026-05-21T02:30:00.000Z"
      });
      notes = notes.map((item) => (item.id === id ? updated : item));
      return Response.json({ note: updated });
    }

    if (url.startsWith("/api/notes/") && method === "DELETE") {
      const id = url.split("/").at(-1) ?? "";
      notes = notes.filter((item) => item.id !== id);
      return Response.json({ deleted: true });
    }

    throw new Error(`Unexpected request ${method} ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.stubGlobal("confirm", vi.fn(() => true));
});

describe("QuickNotesPanel", () => {
  it("creates a default empty selected note when the list is empty", async () => {
    const fetchMock = mockFetch([]);

    render(<QuickNotesPanel />);

    const item = await screen.findByRole("button", { name: "打开记录 未命名记录" });
    expect(within(item).getByText("无标签")).toBeInTheDocument();
    expect(within(item).getByText("2026-05-21")).toBeInTheDocument();
    expect(screen.getByLabelText("随手记标签")).toHaveValue("");
    expect(screen.getByLabelText("随手记标题")).toHaveValue("");
    expect(screen.getByLabelText("随手记正文")).toHaveValue("");
    expect(fetchMock).toHaveBeenCalledWith("/api/notes", expect.objectContaining({ method: "POST" }));
  });

  it("auto-saves tag, title, and content without moving the note in the index", async () => {
    const older = note({ id: "older", tag: "想法", title: "旧记录", createdAt: "2026-05-21T01:00:00.000Z" });
    const newer = note({ id: "newer", tag: "复盘", title: "新记录", createdAt: "2026-05-21T02:00:00.000Z" });
    const fetchMock = mockFetch([newer, older]);

    render(<QuickNotesPanel />);

    expect(await screen.findByRole("button", { name: "打开记录 新记录" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "打开记录 旧记录" }));

    fireEvent.change(screen.getByLabelText("随手记标签"), { target: { value: "灵感" } });
    fireEvent.change(screen.getByLabelText("随手记标题"), { target: { value: "新的标题" } });
    fireEvent.change(screen.getByLabelText("随手记正文"), { target: { value: "正文还没有写完。" } });

    expect(screen.getByRole("status", { name: "随手记保存状态" })).toHaveTextContent("未保存");

    await waitFor(() => expect(screen.getByRole("status", { name: "随手记保存状态" })).toHaveTextContent(/已保存/));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/notes/older",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          tag: "灵感",
          title: "新的标题",
          content: "正文还没有写完。"
        })
      })
    );

    const list = screen.getByRole("list", { name: "随手记列表" });
    const items = within(list).getAllByRole("button", { name: /^打开记录/ });
    expect(items.map((item) => item.textContent)).toEqual(expect.arrayContaining(["复盘新记录2026-05-21", "灵感新的标题2026-05-21"]));
    expect(items[0]).toHaveTextContent("新记录");
    expect(items[1]).toHaveTextContent("新的标题");
  });

  it("groups today's notes before past notes with a visual divider", async () => {
    const now = new Date();
    const today = formatDate(now);
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(now.getDate() - 1);
    const yesterday = formatDate(yesterdayDate);
    mockFetch([
      note({ id: "today", tag: "今日", title: "今天记录", createdAt: `${today}T02:00:00.000Z` }),
      note({ id: "past", tag: "旧事", title: "昨天记录", createdAt: `${yesterday}T02:00:00.000Z` })
    ]);

    render(<QuickNotesPanel />);

    expect(await screen.findByText("当天")).toBeInTheDocument();
    expect(screen.getByText("往日")).toBeInTheDocument();
    expect(screen.getByTestId("past-notes-divider")).toHaveClass("border-dashed");
    expect(screen.getByRole("button", { name: "打开记录 今天记录" }).textContent).toContain(today);
    expect(screen.getByRole("button", { name: "打开记录 昨天记录" }).textContent).toContain(yesterday);
  });

  it("keeps tags within four characters and deletes notes after confirmation", async () => {
    const fetchMock = mockFetch([note({ id: "note_1", tag: "复盘", title: "实验日志" })]);

    render(<QuickNotesPanel />);

    expect(await screen.findByRole("button", { name: "打开记录 实验日志" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("随手记标签"), { target: { value: "超过四个字" } });
    expect(screen.getByLabelText("随手记标签")).toHaveValue("超过四个");

    fireEvent.click(screen.getByRole("button", { name: "删除记录 实验日志" }));

    expect(window.confirm).toHaveBeenCalledWith("删除这条随手记？");
    await waitFor(() => expect(screen.queryByText("实验日志")).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/notes/note_1", expect.objectContaining({ method: "DELETE" }));
  });

  it("does not render or save IME composition text before it is committed", async () => {
    const fetchMock = mockFetch([note({ id: "note_1", tag: "想法", title: "实验日志" })]);

    render(<QuickNotesPanel />);

    const tagInput = await screen.findByLabelText("随手记标签");
    expect(screen.getByRole("button", { name: "打开记录 实验日志" })).toHaveTextContent("想法");

    fireEvent.compositionStart(tagInput);
    fireEvent.change(tagInput, { target: { value: "ling" } });

    expect(tagInput).toHaveValue("ling");
    expect(screen.getByRole("button", { name: "打开记录 实验日志" })).toHaveTextContent("想法");
    expect(screen.getByRole("button", { name: "打开记录 实验日志" })).not.toHaveTextContent("ling");
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/notes/note_1",
      expect.objectContaining({
        body: expect.stringContaining("ling")
      })
    );

    fireEvent.change(tagInput, { target: { value: "灵感" } });
    fireEvent.compositionEnd(tagInput);

    await waitFor(() => expect(screen.getByRole("button", { name: "打开记录 实验日志" })).toHaveTextContent("灵感"));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/notes/note_1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            tag: "灵感",
            title: "实验日志",
            content: ""
          })
        })
      )
    );
  });
});

function formatDate(value: Date): string {
  return value.toLocaleDateString("en-CA");
}
