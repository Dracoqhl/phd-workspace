import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QuickLinkDock } from "@/components/quick-links/QuickLinkDock";
import type { QuickLinkGroup } from "@/types/quick-link";

const firstGroup: QuickLinkGroup = {
  id: "group_bilibili",
  domain: "bilibili.com",
  displayName: "bilibili",
  iconUrl: "https://www.google.com/s2/favicons?domain=bilibili.com&sz=128",
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

const secondGroup: QuickLinkGroup = {
  id: "group_notion",
  domain: "notion.so",
  displayName: "notion",
  iconUrl: "https://www.google.com/s2/favicons?domain=notion.so&sz=128",
  defaultLinkId: "link_notion",
  sortOrder: 1,
  createdAt: "2026-05-30T10:02:00.000Z",
  updatedAt: "2026-05-30T10:02:00.000Z",
  links: [
    {
      id: "link_notion",
      groupId: "group_notion",
      title: "工作区",
      url: "https://notion.so/work",
      sortOrder: 0,
      createdAt: "2026-05-30T10:02:00.000Z",
      updatedAt: "2026-05-30T10:02:00.000Z"
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

    expect(await screen.findByRole("button", { name: "打开 bilibili" })).toBeInTheDocument();
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

    expect(await screen.findByRole("button", { name: "打开 bilibili" })).toBeInTheDocument();
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
    expect(await screen.findByRole("button", { name: "打开 哔哩哔哩" })).toBeInTheDocument();

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

  it("uploads a custom logo and shows title-fetch guidance in settings", async () => {
    const customIcon = "data:image/png;base64,Y3VzdG9t";
    const groupWithCustomIcon = { ...firstGroup, iconUrl: customIcon };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/quick-links" && !init) return Response.json({ groups: [firstGroup] });
      if (url === "/api/quick-links/groups/group_bilibili" && init?.method === "PATCH") {
        return Response.json({ groups: [groupWithCustomIcon] });
      }
      throw new Error(`Unexpected request ${url} ${String(init?.method ?? "GET")}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<QuickLinkDock />);

    fireEvent.click(await screen.findByRole("button", { name: "管理 bilibili" }));
    expect(screen.getByText(/当前部分网页标题无法稳定自动抓取/)).toBeInTheDocument();

    const upload = screen.getByLabelText("上传自定义 Logo");
    const file = new File(["custom"], "logo.png", { type: "image/png" });
    fireEvent.change(upload, { target: { files: [file] } });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/quick-links/groups/group_bilibili",
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining("data:image/png;base64")
        })
      )
    );
    expect(await screen.findByRole("button", { name: "打开 bilibili" })).toBeInTheDocument();
    expect(document.querySelector("img")).toHaveAttribute("src", customIcon);
  });

  it("reorders groups through the organize dialog without dragging logos", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    const reorderedGroups = [secondGroup, firstGroup];
    const linksReorderedGroup = { ...firstGroup, links: [firstGroup.links[1], firstGroup.links[0]] };
    const titleEditedGroup = { ...linksReorderedGroup, links: [{ ...firstGroup.links[1], title: "个人空间" }, firstGroup.links[0]] };
    const defaultChangedGroup = { ...titleEditedGroup, defaultLinkId: "link_space" };
    const linkDeletedGroup = { ...defaultChangedGroup, links: [{ ...firstGroup.links[1], title: "个人空间" }], defaultLinkId: "link_space" };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/quick-links" && !init) return Response.json({ groups: [firstGroup, secondGroup] });
      if (url === "/api/quick-links/groups/reorder" && init?.method === "POST") return Response.json({ groups: reorderedGroups });
      if (url === "/api/quick-links/groups/group_bilibili/links/reorder" && init?.method === "PATCH") {
        return Response.json({ groups: [linksReorderedGroup, secondGroup] });
      }
      if (url === "/api/quick-links/link_space" && init?.method === "PATCH") return Response.json({ groups: [titleEditedGroup, secondGroup] });
      if (url === "/api/quick-links/link_space/default" && init?.method === "POST") return Response.json({ groups: [defaultChangedGroup, secondGroup] });
      if (url === "/api/quick-links/link_video" && init?.method === "DELETE") return Response.json({ groups: [linkDeletedGroup, secondGroup] });
      throw new Error(`Unexpected request ${url} ${String(init?.method ?? "GET")}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<QuickLinkDock />);

    const dragData = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: "move",
      getData: (key: string) => dragData.get(key) ?? "",
      setData: (key: string, value: string) => dragData.set(key, value)
    };
    const logoButton = await screen.findByRole("button", { name: "打开 bilibili" });
    expect(logoButton).not.toHaveAttribute("draggable");
    fireEvent.click(screen.getByRole("button", { name: "整理网页导航顺序" }));
    expect(screen.getByText(/后续会上线浏览器插件/)).toBeInTheDocument();
    expect(screen.queryByText("/video/BV1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "复制子网站 视频" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://www.bilibili.com/video/BV1"));
    expect(await screen.findByRole("button", { name: "已复制子网站 视频" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下移 bilibili" })).not.toBeInTheDocument();
    fireEvent.dragStart(screen.getByRole("button", { name: "拖动域名 bilibili" }), { dataTransfer });
    const targetGroupRow = screen.getByRole("button", { name: "拖动域名 notion" }).closest("div")!;
    fireEvent.dragOver(targetGroupRow, { clientY: 100, dataTransfer });
    fireEvent.drop(targetGroupRow.parentElement!, { clientY: 100, dataTransfer });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/quick-links/groups/reorder",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ groupIds: ["group_notion", "group_bilibili"] })
        })
      )
    );

    fireEvent.dragStart(screen.getByRole("button", { name: "拖动子网站 视频" }), { dataTransfer });
    const targetLinkRow = screen.getByRole("button", { name: "拖动子网站 空间" }).closest("div")!;
    fireEvent.dragOver(targetLinkRow, { clientY: 100, dataTransfer });
    fireEvent.drop(targetLinkRow.parentElement!, { clientY: 100, dataTransfer });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/quick-links/groups/group_bilibili/links/reorder",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ linkIds: ["link_space", "link_video"] })
        })
      )
    );

    expect(screen.queryByRole("button", { name: "保存子网站 空间" })).not.toBeInTheDocument();
    const titleInput = screen.getByLabelText("子网站名称 空间");
    fireEvent.change(titleInput, { target: { value: "个人空间" } });
    fireEvent.blur(titleInput);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/quick-links/link_space",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ title: "个人空间", url: "https://space.bilibili.com/123" })
        })
      )
    );

    fireEvent.click(screen.getByRole("button", { name: "设为首选 个人空间" }));
    expect(screen.getByRole("button", { name: "当前首选 个人空间" })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/quick-links/link_space/default", { method: "POST" }));
    expect(await screen.findByRole("button", { name: "当前首选 个人空间" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "删除子网站 视频" }));
    fireEvent.click(await screen.findByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/quick-links/link_video", { method: "DELETE" }));
  });

  it("shows a fallback letter when favicon loading fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ groups: [firstGroup] })));

    render(<QuickLinkDock />);

    await screen.findByRole("button", { name: "打开 bilibili" });
    const image = document.querySelector("img");
    expect(image).not.toBeNull();
    expect(image).toHaveAttribute("src", "/api/quick-links/icon?domain=bilibili.com");
    fireEvent.error(image!);

    expect(screen.getByText("b")).toBeInTheDocument();
  });
});
