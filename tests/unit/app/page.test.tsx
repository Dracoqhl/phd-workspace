import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Page from "@/app/page";
import { WorkspacePageContent } from "@/app/workspace-page-content";
import {
  getSessionSecret,
  SESSION_COOKIE_NAME,
  verifySessionToken
} from "@/lib/auth/session";
import { cookies } from "next/headers";

vi.mock("@/lib/domain/habits", () => ({
  getHabitBusinessDate: () => "2026-05-08"
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionSecret: vi.fn(),
  SESSION_COOKIE_NAME: "phd_workspace_session",
  verifySessionToken: vi.fn()
}));

vi.mock("@/components/tasks/TaskManager", () => ({
  TaskManager: () => <section aria-label="任务管理">Task manager</section>
}));

vi.mock("@/components/notes/QuickNotesPanel", () => ({
  QuickNotesPanel: () => <section aria-label="随手记">Quick notes</section>
}));

vi.mock("@/components/habits/HabitManager", () => ({
  HabitManager: () => <section aria-label="每日健康习惯">Habit manager</section>
}));

vi.mock("@/components/care/CarePanel", () => ({
  CarePanel: () => <section aria-label="心灵关怀">Care panel</section>
}));

vi.mock("@/components/assistant/AiAssistantPanel", () => ({
  AiAssistantPanel: () => (
    <aside aria-label="AI 助手">
      <button type="button">Test AI</button>
    </aside>
  )
}));

vi.mock("@/components/admin/AdminDashboard", () => ({
  AdminDashboard: () => <section aria-label="管理员工作台">Admin dashboard</section>
}));

const mockedCookies = vi.mocked(cookies);
const mockedGetSessionSecret = vi.mocked(getSessionSecret);
const mockedVerifySessionToken = vi.mocked(verifySessionToken);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("workspace page shell", () => {
  it("renders the login screen when unauthenticated", () => {
    render(<WorkspacePageContent authenticated={false} />);

    expect(screen.getByRole("heading", { name: "博士工作台" })).toBeInTheDocument();
    expect(screen.queryByText(/MVP|最小可运行页面壳/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Access password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log In" })).toBeInTheDocument();
    expect(screen.getByLabelText("Access password").closest("form")).toHaveAttribute("method", "post");
    expect(screen.getByLabelText("Access password").closest("form")).toHaveAttribute("action", "/api/auth/login");
  });

  it("can render the registration form as the initial auth mode", () => {
    render(<WorkspacePageContent authenticated={false} initialAuthMode="register" multiUserEnabled={true} />);

    expect(screen.getByRole("button", { name: "Create Account" })).toBeInTheDocument();
    expect(screen.getByLabelText("Invite code")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log In" })).toHaveAttribute("href", "?mode=login");
    expect(screen.getByRole("link", { name: "Register" })).toHaveAttribute("href", "?mode=register");
  });

  it("renders the workspace regions when authenticated", () => {
    render(<WorkspacePageContent authenticated={true} user={{ email: "student@example.com", role: "user" }} />);

    expect(screen.getByRole("heading", { name: "博士工作台" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open GitHub repository Dracoqhl/phd-workspace" })).toHaveAttribute(
      "href",
      "https://github.com/Dracoqhl/phd-workspace"
    );
    expect(screen.getByText("2026-05-08")).toBeInTheDocument();
    expect(screen.getByLabelText("Theme")).toHaveValue("light");
    expect(screen.getByRole("status", { name: "Data sync status" })).toHaveTextContent("Synced");
    expect(screen.getByLabelText("Workspace status")).toContainElement(
      screen.getByRole("status", { name: "Data sync status" })
    );
    expect(screen.getByLabelText("Account controls")).toHaveTextContent("student@example.com");
    expect(screen.getByLabelText("Account controls")).toContainElement(screen.getByRole("button", { name: "Logout" }));
    expect(screen.getByRole("region", { name: "任务管理" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "随手记" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "每日健康习惯" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "心灵关怀" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "AI 助手" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test AI" })).toBeInTheDocument();
  });

  it("renders only the admin dashboard for admin users", () => {
    render(<WorkspacePageContent authenticated={true} user={{ email: "admin@example.com", role: "admin" }} />);

    expect(screen.getByRole("region", { name: "管理员工作台" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "任务管理" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "随手记" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "每日健康习惯" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "心灵关怀" })).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "AI 助手" })).not.toBeInTheDocument();
  });

  it("marks the password input invalid and describes it with the login error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ authenticated: false, error: "Invalid password" }, { status: 401 })
      )
    );

    render(<WorkspacePageContent authenticated={false} />);

    const input = screen.getByLabelText("Access password");
    fireEvent.change(input, { target: { value: "wrong-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Log In" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid password");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "access-password-error");
  });

  it("authenticates the default page from the session cookie", () => {
    mockedCookies.mockReturnValue({
      get: vi.fn().mockReturnValue({ value: "session-token" })
    } as unknown as ReturnType<typeof cookies>);
    mockedGetSessionSecret.mockReturnValue("session-secret");
    mockedVerifySessionToken.mockReturnValue(true);

    render(<Page />);

    expect(mockedCookies().get).toHaveBeenCalledWith(SESSION_COOKIE_NAME);
    expect(mockedGetSessionSecret).toHaveBeenCalledWith();
    expect(mockedVerifySessionToken).toHaveBeenCalledWith("session-token", "session-secret");
    expect(screen.getByRole("complementary", { name: "AI 助手" })).toBeInTheDocument();
  });

  it("renders the login screen when SESSION_SECRET is missing", () => {
    mockedCookies.mockReturnValue({
      get: vi.fn().mockReturnValue({ value: "session-token" })
    } as unknown as ReturnType<typeof cookies>);
    mockedGetSessionSecret.mockImplementation(() => {
      throw new Error("SESSION_SECRET is not configured");
    });

    render(<Page />);

    expect(mockedVerifySessionToken).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Access password")).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "AI 助手" })).not.toBeInTheDocument();
  });
});
