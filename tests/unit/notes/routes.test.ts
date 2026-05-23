import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as createInvite } from "@/app/api/admin/invites/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as register } from "@/app/api/auth/register/route";
import { DELETE as deleteNote, PATCH as updateNote } from "@/app/api/notes/[id]/route";
import { GET as listNotes, POST as createNote } from "@/app/api/notes/route";
import { closeDatabase, getDatabase } from "@/lib/db/database";
import { ensureDatabaseSchema } from "@/lib/db/schema";
import type { QuickNote } from "@/types/note";

const baseUrl = "http://localhost";

let tempDir: string | null = null;
let adminCookie = "";
let userCookie = "";

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "phd-notes-routes-"));
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

describe("quick note routes", () => {
  it("rejects unauthenticated note requests", async () => {
    const response = await listNotes(new Request(`${baseUrl}/api/notes`));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("creates, lists, updates, and deletes quick notes for the authenticated user", async () => {
    const created = await createNoteJson(userCookie);
    expect(created).toMatchObject({
      tag: "",
      title: "",
      content: ""
    });

    const updatedResponse = await updateNote(
      authRequest(userCookie, `${baseUrl}/api/notes/${created.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          tag: "复盘",
          title: "实验日志整理",
          content: "今天先整理失败样本。"
        })
      }),
      { params: { id: created.id } }
    );

    expect(updatedResponse.status).toBe(200);
    const { note: updated } = (await updatedResponse.json()) as { note: QuickNote };
    expect(updated).toMatchObject({
      id: created.id,
      tag: "复盘",
      title: "实验日志整理",
      content: "今天先整理失败样本。"
    });
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(created.updatedAt).getTime());

    const listResponse = await listNotes(authRequest(userCookie, `${baseUrl}/api/notes`));
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual({ notes: [updated] });

    const deleteResponse = await deleteNote(authRequest(userCookie, `${baseUrl}/api/notes/${created.id}`, { method: "DELETE" }), {
      params: { id: created.id }
    });
    expect(deleteResponse.status).toBe(200);
    await expect(deleteResponse.json()).resolves.toEqual({ deleted: true });

    const emptyListResponse = await listNotes(authRequest(userCookie, `${baseUrl}/api/notes`));
    await expect(emptyListResponse.json()).resolves.toEqual({ notes: [] });
  });

  it("orders quick notes by creation time descending without reordering on update", async () => {
    const first = await createNoteJson(userCookie);
    const second = await createNoteJson(userCookie);

    const updateResponse = await updateNote(
      authRequest(userCookie, `${baseUrl}/api/notes/${first.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: "Updated older note" })
      }),
      { params: { id: first.id } }
    );
    expect(updateResponse.status).toBe(200);

    const listResponse = await listNotes(authRequest(userCookie, `${baseUrl}/api/notes`));
    const { notes } = (await listResponse.json()) as { notes: QuickNote[] };
    expect(notes.map((note) => note.id)).toEqual([second.id, first.id]);
  });

  it("isolates quick notes between users", async () => {
    const adminNote = await createNoteJson(adminCookie);
    const userNote = await createNoteJson(userCookie);

    const adminListResponse = await listNotes(authRequest(adminCookie, `${baseUrl}/api/notes`));
    await expect(adminListResponse.json()).resolves.toEqual({ notes: [adminNote] });

    const userListResponse = await listNotes(authRequest(userCookie, `${baseUrl}/api/notes`));
    await expect(userListResponse.json()).resolves.toEqual({ notes: [userNote] });
  });

  it("rejects invalid quick note payloads", async () => {
    const created = await createNoteJson(userCookie);
    const tooLongTagResponse = await updateNote(
      authRequest(userCookie, `${baseUrl}/api/notes/${created.id}`, {
        method: "PATCH",
        body: JSON.stringify({ tag: "超过四个字" })
      }),
      { params: { id: created.id } }
    );

    expect(tooLongTagResponse.status).toBe(400);
    await expect(tooLongTagResponse.json()).resolves.toEqual({ error: "Invalid note payload" });
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

async function createNoteJson(cookie: string): Promise<QuickNote> {
  const response = await createNote(authRequest(cookie, `${baseUrl}/api/notes`, { method: "POST" }));
  expect(response.status).toBe(201);
  return ((await response.json()) as { note: QuickNote }).note;
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
