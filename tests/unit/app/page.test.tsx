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
    expect(screen.getByLabelText("Access password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log In" })).toBeInTheDocument();
  });

  it("renders the workspace regions when authenticated", () => {
    render(<WorkspacePageContent authenticated={true} />);

    expect(screen.getByRole("heading", { name: "博士工作台" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "任务管理" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "每日健康习惯" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "心灵关怀" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "AI 助手" })).toBeInTheDocument();
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
