import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QuickLinkDock } from "@/components/quick-links/QuickLinkDock";
import type { QuickLinkGroup } from "@/types/quick-link";

const firstGroup: QuickLinkGroup = {
  id: "group_bilibili",
  domain: "bilibili.com",
  displayName: "bilibili",
  iconUrl: "https://www.google.com/s2/favicons?domain=bilibili.com&sz=64",
  defaultLinkId: "link_video",
  sortOrder: 0,
  createdAt: "2026-05-30T10:00:00.000Z",
  updatedAt: "2026-05-30T10:00:00.000Z",
  links: [
    {
      id: "link_video",
      groupId: "group_bilibili",
      title: "视频",
      url: "https://www.bilibili.com/video/BV1",
      sortOrder: 0,
      createdAt: "2026-05-30T10:00:00.000Z",
      updatedAt: "2026-05-30T10:00:00.000Z"
    },
    {
      id: "link_space",
      groupId: "group_bilibili",
      title: "空间",
      url: "https://space.bilibili.com/123",
      sortOrder: 1,
      createdAt: "2026-05-30T10:01:00.000Z",
      updatedAt: "2026-05-30T10:01:00.000Z"
    }
  ]
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("QuickLinkDock", () => {
  it("renders quick link logos and opens the default link in a new tab", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ groups: [firstGroup] })));
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(<QuickLinkDock />);

    expect(await screen.findByText("bilibili")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "打开 bilibili" }));

    expect(openSpy).toHaveBeenCalledWith("https://www.bilibili.com/video/BV1", "_blank", "noopener,noreferrer");
    expect(screen.getByRole("button", { name: "新增网页导航" })).toBeInTheDocument();
  });

  it("adds a quick link from the global plus entry", async () => {
    const nextGroups = [{ ...firstGroup, links: [firstGroup.links[0]] }];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/quick-links" && !init) return Response.json({ groups: [] });
      if (String(input) === "/api/quick-links" && init?.method === "POST") return Response.json({ groups: nextGroups }, { status: 201 });
      throw new Error(`Unexpected request ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<QuickLinkDock />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/quick-links"));
    fireEvent.click(await screen.findByRole("button", { name: "新增网页导航" }));
    fireEvent.change(await screen.findByLabelText("网页 URL"), { target: { value: "bilibili.com/video/BV1" } });
    fireEvent.change(screen.getByLabelText("网页名称"), { target: { value: "视频" } });
    fireEvent.click(screen.getAllByRole("button", { name: "保存" })[0]);

    expect(await screen.findByText("bilibili")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/quick-links",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ url: "bilibili.com/video/BV1", title: "视频" })
      })
    );
  });

  it("manages group names, defaults, and delete confirmation", async () => {
    const groupRenamed = { ...firstGroup, displayName: "哔哩哔哩" };
    const groupDefaultChanged = { ...groupRenamed, defaultLinkId: "link_space", links: [firstGroup.links[1], firstGroup.links[0]] };
    const groupAfterDelete = { ...groupDefaultChanged, links: [firstGroup.links[0]], defaultLinkId: "link_video" };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/quick-links" && !init) return Response.json({ groups: [firstGroup] });
      if (url === "/api/quick-links/groups/group_bilibili" && init?.method === "PATCH") return Response.json({ groups: [groupRenamed] });
      if (url === "/api/quick-links/link_space/default" && init?.method === "POST") return Response.json({ groups: [groupDefaultChanged] });
      if (url === "/api/quick-links/link_space" && init?.method === "DELETE") return Response.json({ groups: [groupAfterDelete] });
      throw new Error(`Unexpected request ${url} ${String(init?.method ?? "GET")}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<QuickLinkDock />);

    fireEvent.click(await screen.findByRole("button", { name: "管理 bilibili" }));
    fireEvent.change(screen.getByLabelText("Logo 名称"), { target: { value: "哔哩哔哩" } });
    fireEvent.click(screen.getAllByRole("button", { name: "保存" })[0]);
    expect(await screen.findByText("哔哩哔哩")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "设为默认" })[1]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/quick-links/link_space/default", { method: "POST" }));

    const deleteButtons = screen.getAllByRole("button", { name: "删除" });
    fireEvent.click(deleteButtons[0]);
    expect(await screen.findByRole("dialog", { name: "删除确认" })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("今日不再提醒"));
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() => expect(window.localStorage.getItem("phd-workspace-quick-link-delete-skip-date")).toBe(new Date().toISOString().slice(0, 10)));
    expect(fetchMock).toHaveBeenCalledWith("/api/quick-links/link_space", { method: "DELETE" });
  });

  it("shows a fallback letter when favicon loading fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ groups: [firstGroup] })));

    render(<QuickLinkDock />);

    await screen.findByText("bilibili");
    const image = document.querySelector("img");
    expect(image).not.toBeNull();
    fireEvent.error(image!);

    expect(screen.getByText("b")).toBeInTheDocument();
  });
});
