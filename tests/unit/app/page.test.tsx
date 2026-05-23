import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  window.localStorage.clear();
});

describe("workspace page shell", () => {
  it("renders the login screen when unauthenticated", () => {
    render(<WorkspacePageContent authenticated={false} />);

    expect(screen.getByRole("heading", { name: /我的\s*工作台/ })).toBeInTheDocument();
    expect(screen.queryByText("可自定义")).not.toBeInTheDocument();
    expect(screen.queryByText("点击高亮文字修改工作台名称")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看 V1.1 更新日志" })).toBeInTheDocument();
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

    expect(screen.getByRole("heading", { name: /我的\s*工作台/ })).toBeInTheDocument();
    expect(screen.queryByText("PhD Workspace")).not.toBeInTheDocument();
    expect(screen.getByText("管理任务、每日习惯、心灵关怀和 AI 辅助整理的个人工作台。")).toBeInTheDocument();
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

  it("shows release notes on first visit to a new version and remembers dismissal", async () => {
    const { unmount } = render(<WorkspacePageContent authenticated={true} user={{ email: "user@example.com", role: "user" }} />);

    expect(await screen.findByRole("dialog", { name: /V1\.1 更通用的个人工作台/ })).toBeInTheDocument();
    expect(screen.getByText("新增随手记模块，用于记录灵感、复盘和临时想法。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(window.localStorage.getItem("phd-workspace-last-seen-version")).toBe("1.1");

    unmount();
    render(<WorkspacePageContent authenticated={true} user={{ email: "user@example.com", role: "user" }} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens release notes from the version badge and can show previous versions", async () => {
    window.localStorage.setItem("phd-workspace-last-seen-version", "1.1");
    render(<WorkspacePageContent authenticated={true} user={{ email: "user@example.com", role: "user" }} />);

    fireEvent.click(screen.getByRole("button", { name: "查看 V1.1 更新日志" }));

    expect(await screen.findByRole("dialog", { name: /V1\.1 更通用的个人工作台/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "V1.0" }));

    expect(screen.getByRole("dialog", { name: /V1\.0 基础工作台/ })).toBeInTheDocument();
    expect(screen.getByText("支持任务和子任务管理，包含状态、优先级、截止日期和完成状态。")).toBeInTheDocument();
  });

  it("lets users customize the workspace title prefix locally", () => {
    window.localStorage.setItem("phd-workspace-last-seen-version", "1.1");
    render(<WorkspacePageContent authenticated={true} user={{ email: "user@example.com", role: "user" }} />);

    fireEvent.click(screen.getByRole("button", { name: "修改工作台名称前缀" }));
    const input = screen.getByLabelText("工作台名称前缀");
    fireEvent.change(input, { target: { value: "家庭" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByRole("heading", { name: /家庭\s*工作台/ })).toBeInTheDocument();
    expect(window.localStorage.getItem("phd-workspace-title-prefix")).toBe("家庭");
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
