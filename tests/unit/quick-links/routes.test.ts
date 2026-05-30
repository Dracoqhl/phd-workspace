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
      iconUrl: "https://www.google.com/s2/favicons?domain=bilibili.com&sz=64"
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
