import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminDashboard } from "@/components/admin/AdminDashboard";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AdminDashboard", () => {
  it("loads overview stats, invite state, users, and copies invite codes", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/admin/overview") {
        return Response.json({
          stats: { users: 2, invites: 2, usedInvites: 1, unusedInvites: 1, tasks: 4, habits: 3 },
          invites: [
            {
              id: "invite_1",
              code: "invite-code-1",
              status: "unused",
              consumedByEmail: null,
              consumedByUserId: null,
              createdAt: "2026-05-18T10:00:00.000Z"
            },
            {
              id: "invite_2",
              code: "invite-code-2",
              status: "used",
              consumedByEmail: "student@example.com",
              consumedByUserId: "user_1",
              createdAt: "2026-05-18T09:00:00.000Z"
            }
          ],
          users: [
            { id: "admin", email: "admin@example.com", role: "admin", createdAt: "2026-05-18T08:00:00.000Z", tasksCount: 0, habitsCount: 0 },
            { id: "student", email: "student@example.com", role: "user", createdAt: "2026-05-18T09:30:00.000Z", tasksCount: 4, habitsCount: 3 }
          ]
        });
      }

      if (String(input) === "/api/admin/invites" && init?.method === "POST") {
        return Response.json(
          {
            invite: {
              id: "invite_3",
              code: "invite-code-3",
              status: "unused",
              consumedByEmail: null,
              consumedByUserId: null,
              createdAt: "2026-05-18T11:00:00.000Z"
            }
          },
          { status: 201 }
        );
      }

      return Response.json({ error: "Unexpected request" }, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminDashboard />);

    expect(await screen.findByText("Admin Dashboard")).toBeInTheDocument();
    expect(screen.getByLabelText("Users: 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Invites: 2")).toBeInTheDocument();
    expect(screen.getByText("invite-code-1")).toBeInTheDocument();
    expect(screen.getByText("student@example.com")).toBeInTheDocument();
    expect(screen.getByText("4 tasks")).toBeInTheDocument();
    expect(screen.getByText("3 habits")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy invite-code-1" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("invite-code-1"));
    expect(await screen.findByText("Copied")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New Invite" }));
    expect(await screen.findByText("invite-code-3")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/invites", { method: "POST" });
  });
});
