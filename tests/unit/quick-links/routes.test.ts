import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as createInvite } from "@/app/api/admin/invites/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as register } from "@/app/api/auth/register/route";
import { DELETE as deleteQuickLink, PATCH as updateQuickLink } from "@/app/api/quick-links/[id]/route";
import { POST as setDefaultQuickLink } from "@/app/api/quick-links/[id]/default/route";
import { DELETE as deleteQuickLinkGroup, PATCH as updateQuickLinkGroup } from "@/app/api/quick-links/groups/[id]/route";
import { PATCH as reorderQuickLinks } from "@/app/api/quick-links/groups/[id]/links/reorder/route";
import { POST as reorderQuickLinkGroups } from "@/app/api/quick-links/groups/reorder/route";
import { GET as getQuickLinkIcon } from "@/app/api/quick-links/icon/route";
import { GET as listQuickLinks, POST as createQuickLink } from "@/app/api/quick-links/route";
import { closeDatabase, getDatabase } from "@/lib/db/database";
import { ensureDatabaseSchema } from "@/lib/db/schema";
import type { QuickLinkGroup } from "@/types/quick-link";

const baseUrl = "http://localhost";

let tempDir: string | null = null;
let adminCookie = "";
let userCookie = "";

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "phd-quick-links-routes-"));
  vi.stubEnv("DATABASE_PATH", join(tempDir, "workspace.sqlite"));
  vi.stubEnv("SESSION_SECRET", "session-secret");
  vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
  vi.stubEnv("ADMIN_PASSWORD", "admin-password");
  ensureDatabaseSchema(getDatabase());

  adminCookie = await loginAndGetCookie("admin@example.com", "admin-password");
  const invite = await createInviteCode(adminCookie);
  userCookie = await registerAndGetCookie("student@example.com", "student-password", invite);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  closeDatabase();

  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("quick link routes", () => {
  it("rejects unauthenticated quick link requests", async () => {
    const response = await listQuickLinks(new Request(`${baseUrl}/api/quick-links`));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("creates groups from URLs, normalizes domains, and groups matching domains", async () => {
    const firstGroups = await createQuickLinkGroups(userCookie, { url: "www.bilibili.com/video/BV1", title: "视频" });
    expect(firstGroups).toHaveLength(1);
    expect(firstGroups[0]).toMatchObject({
      domain: "bilibili.com",
      displayName: "bilibili",
      iconUrl: "https://www.google.com/s2/favicons?domain=bilibili.com&sz=128"
    });
    expect(firstGroups[0].links).toHaveLength(1);
    expect(firstGroups[0].links[0]).toMatchObject({ title: "视频", url: "https://www.bilibili.com/video/BV1" });
    expect(firstGroups[0].defaultLinkId).toBe(firstGroups[0].links[0].id);

    const secondGroups = await createQuickLinkGroups(userCookie, { url: "space.bilibili.com/123", title: "空间" });
    expect(secondGroups).toHaveLength(1);
    expect(secondGroups[0].domain).toBe("bilibili.com");
    expect(secondGroups[0].links.map((link) => link.title)).toEqual(["视频", "空间"]);
    expect(secondGroups[0].defaultLinkId).toBe(firstGroups[0].defaultLinkId);
  });

  it("uses page metadata as the default title when no title is provided", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "https://example.com/work") {
        return new Response('<html><head><meta property="og:title" content="Example Work"></head></html>', {
          headers: { "Content-Type": "text/html; charset=utf-8" }
        });
      }
      throw new Error(`Unexpected metadata request ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const groups = await createQuickLinkGroups(userCookie, { url: "https://example.com/work" });

    expect(groups[0].links[0]).toMatchObject({
      title: "Example Wo",
      url: "https://example.com/work"
    });
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/work", expect.any(Object));
  });

  it("updates display names, sets defaults, and deletes links with fallback defaults", async () => {
    let groups = await createQuickLinkGroups(userCookie, { url: "https://www.xiaohongshu.com/explore/1", title: "收藏" });
    groups = await createQuickLinkGroups(userCookie, { url: "https://www.xiaohongshu.com/user/profile", title: "主页" });
    const group = groups[0];
    const [defaultLink, secondLink] = group.links;

    const updateGroupResponse = await updateQuickLinkGroup(
      authRequest(userCookie, `${baseUrl}/api/quick-links/groups/${group.id}`, {
        method: "PATCH",
        body: JSON.stringify({ displayName: "小红书收藏夹" })
      }),
      { params: { id: group.id } }
    );
    groups = await readGroups(updateGroupResponse);
    expect(groups[0].displayName).toBe("小红书收藏");

    const defaultResponse = await setDefaultQuickLink(
      authRequest(userCookie, `${baseUrl}/api/quick-links/${secondLink.id}/default`, { method: "POST" }),
      { params: { id: secondLink.id } }
    );
    groups = await readGroups(defaultResponse);
    expect(groups[0].defaultLinkId).toBe(secondLink.id);

    const deleteDefaultResponse = await deleteQuickLink(
      authRequest(userCookie, `${baseUrl}/api/quick-links/${secondLink.id}`, { method: "DELETE" }),
      { params: { id: secondLink.id } }
    );
    groups = await readGroups(deleteDefaultResponse);
    expect(groups[0].links).toHaveLength(1);
    expect(groups[0].defaultLinkId).toBe(defaultLink.id);
  });

  it("moves edited links to the matching domain group and isolates users", async () => {
    const adminGroups = await createQuickLinkGroups(adminCookie, { url: "https://example.com/admin", title: "Admin" });
    let userGroups = await createQuickLinkGroups(userCookie, { url: "https://example.com/user", title: "User" });
    userGroups = await createQuickLinkGroups(userCookie, { url: "https://github.com/Dracoqhl/phd-workspace", title: "GitHub" });
    const exampleLink = userGroups.find((group) => group.domain === "example.com")?.links[0];
    expect(exampleLink).toBeDefined();

    const movedResponse = await updateQuickLink(
      authRequest(userCookie, `${baseUrl}/api/quick-links/${exampleLink!.id}`, {
        method: "PATCH",
        body: JSON.stringify({ url: "https://docs.github.com/actions", title: "文档资料很长" })
      }),
      { params: { id: exampleLink!.id } }
    );
    userGroups = await readGroups(movedResponse);
    expect(userGroups.map((group) => group.domain)).toEqual(["github.com"]);
    expect(userGroups[0].links.map((link) => link.title)).toEqual(["GitHub", "文档资料很"]);

    const adminListResponse = await listQuickLinks(authRequest(adminCookie, `${baseUrl}/api/quick-links`));
    await expect(adminListResponse.json()).resolves.toEqual({ groups: adminGroups });
  });

  it("deletes the group when the last link is deleted and rejects invalid payloads", async () => {
    const groups = await createQuickLinkGroups(userCookie, { url: "https://notion.so/work", title: "Notion" });
    const deleteResponse = await deleteQuickLink(
      authRequest(userCookie, `${baseUrl}/api/quick-links/${groups[0].links[0].id}`, { method: "DELETE" }),
      { params: { id: groups[0].links[0].id } }
    );
    expect(await readGroups(deleteResponse)).toEqual([]);

    const invalidResponse = await createQuickLink(
      authRequest(userCookie, `${baseUrl}/api/quick-links`, {
        method: "POST",
        body: JSON.stringify({ url: "javascript:alert(1)" })
      })
    );
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({ error: "Invalid quick link payload" });
  });

  it("can delete an entire quick link group", async () => {
    const groups = await createQuickLinkGroups(userCookie, { url: "https://github.com/openai", title: "GitHub" });
    const response = await deleteQuickLinkGroup(authRequest(userCookie, `${baseUrl}/api/quick-links/groups/${groups[0].id}`, { method: "DELETE" }), {
      params: { id: groups[0].id }
    });

    expect(await readGroups(response)).toEqual([]);
  });

  it("reorders quick link groups for the current user", async () => {
    let groups = await createQuickLinkGroups(userCookie, { url: "https://github.com/openai", title: "GitHub" });
    groups = await createQuickLinkGroups(userCookie, { url: "https://notion.so/work", title: "Notion" });
    expect(groups.map((group) => group.domain)).toEqual(["github.com", "notion.so"]);

    const response = await reorderQuickLinkGroups(
      authRequest(userCookie, `${baseUrl}/api/quick-links/groups/reorder`, {
        method: "POST",
        body: JSON.stringify({ groupIds: [groups[1].id, groups[0].id] })
      })
    );

    groups = await readGroups(response);
    expect(groups.map((group) => group.domain)).toEqual(["notion.so", "github.com"]);
  });

  it("reorders quick links inside one domain group", async () => {
    let groups = await createQuickLinkGroups(userCookie, { url: "https://www.bilibili.com/video/BV1", title: "视频" });
    groups = await createQuickLinkGroups(userCookie, { url: "https://space.bilibili.com/123", title: "空间" });
    const group = groups[0];
    expect(group.links.map((link) => link.title)).toEqual(["视频", "空间"]);

    const response = await reorderQuickLinks(
      authRequest(userCookie, `${baseUrl}/api/quick-links/groups/${group.id}/links/reorder`, {
        method: "PATCH",
        body: JSON.stringify({ linkIds: [group.links[1].id, group.links[0].id] })
      }),
      { params: { id: group.id } }
    );

    groups = await readGroups(response);
    expect(groups[0].links.map((link) => link.title)).toEqual(["空间", "视频"]);
  });

  it("proxies favicons through the server and falls back to the site favicon", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.inftab.com/v2/icon/get_logo_list")) {
        return Response.json({ code: 0, data: [{ src: "https://icons.example.com/tiny.png" }] });
      }
      if (url === "https://icons.example.com/tiny.png") {
        return new Response(createPngBytes(64, 64), { headers: { "Content-Type": "image/png" } });
      }
      if (url.includes("google.com/s2/favicons")) {
        return new Response(new Uint8Array([0]), { status: 404, headers: { "Content-Type": "image/png" } });
      }
      if (url === "https://xiaohongshu.com/favicon.ico") {
        return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/x-icon" } });
      }
      throw new Error(`Unexpected favicon request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getQuickLinkIcon(authRequest(userCookie, `${baseUrl}/api/quick-links/icon?domain=xiaohongshu.com`));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/x-icon");
    await expect(response.arrayBuffer()).resolves.toHaveProperty("byteLength", 3);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("api.inftab.com/v2/icon/get_logo_list"), expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith("https://icons.example.com/tiny.png", expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("google.com/s2/favicons"), expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith("https://xiaohongshu.com/favicon.ico", expect.any(Object));
  });

  it("prefers a high resolution inftab logo before generic favicons", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.inftab.com/v2/icon/get_logo_list")) {
        return Response.json({ code: 0, data: [{ src: "https://icons.example.com/xiaohongshu.png" }] });
      }
      if (url === "https://icons.example.com/xiaohongshu.png") {
        return new Response(createPngBytes(300, 300), { headers: { "Content-Type": "image/png" } });
      }
      throw new Error(`Unexpected favicon request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getQuickLinkIcon(authRequest(userCookie, `${baseUrl}/api/quick-links/icon?domain=xiaohongshu.com`));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    await expect(response.arrayBuffer()).resolves.toHaveProperty("byteLength", 24);
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("google.com/s2/favicons"), expect.any(Object));
  });

  it("chooses the largest high resolution inftab logo candidate", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.inftab.com/v2/icon/get_logo_list")) {
        return Response.json({
          code: 0,
          data: [
            { src: "https://icons.example.com/xhs-128.png" },
            { src: "https://icons.example.com/xhs-360.png" },
            { src: "https://icons.example.com/xhs-96.png" }
          ]
        });
      }
      if (url === "https://icons.example.com/xhs-128.png") {
        return new Response(createPngBytes(128, 128), { headers: { "Content-Type": "image/png" } });
      }
      if (url === "https://icons.example.com/xhs-360.png") {
        return new Response(createPngBytes(360, 360), { headers: { "Content-Type": "image/png" } });
      }
      if (url === "https://icons.example.com/xhs-96.png") {
        return new Response(createPngBytes(96, 96), { headers: { "Content-Type": "image/png" } });
      }
      throw new Error(`Unexpected favicon request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getQuickLinkIcon(authRequest(userCookie, `${baseUrl}/api/quick-links/icon?domain=xiaohongshu.com`));
    const body = new DataView(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(body.getUint32(16)).toBe(360);
    expect(body.getUint32(20)).toBe(360);
  });
});

async function createInviteCode(cookie: string): Promise<string> {
  const response = await createInvite(
    new Request(`${baseUrl}/api/admin/invites`, {
      method: "POST",
      headers: { Cookie: cookie }
    })
  );
  expect(response.status).toBe(201);
  return ((await response.json()) as { invite: { code: string } }).invite.code;
}

async function registerAndGetCookie(email: string, password: string, inviteCode: string): Promise<string> {
  const response = await register(jsonRequest(`${baseUrl}/api/auth/register`, { email, password, inviteCode }));
  expect(response.status).toBe(201);
  return getSessionCookie(response);
}

async function loginAndGetCookie(email: string, password: string): Promise<string> {
  const response = await login(jsonRequest(`${baseUrl}/api/auth/login`, { email, password }));
  expect(response.status).toBe(200);
  return getSessionCookie(response);
}

async function createQuickLinkGroups(cookie: string, body: { url: string; title?: string }): Promise<QuickLinkGroup[]> {
  const response = await createQuickLink(
    authRequest(cookie, `${baseUrl}/api/quick-links`, {
      method: "POST",
      body: JSON.stringify(body)
    })
  );
  expect(response.status).toBe(201);
  return readGroups(response);
}

async function readGroups(response: Response): Promise<QuickLinkGroup[]> {
  const payload = (await response.json()) as { groups: QuickLinkGroup[] };
  return payload.groups;
}

function authRequest(cookie: string, url: string, init: RequestInit = {}): Request {
  return new Request(url, {
    ...init,
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      ...init.headers
    }
  });
}

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

function getSessionCookie(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("Expected response to set a cookie");
  }

  return setCookie.split(";")[0];
}

function createPngBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}
