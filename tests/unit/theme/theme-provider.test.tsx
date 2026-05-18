import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider, ThemeSelect } from "@/components/theme/ThemeProvider";

describe("ThemeProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-theme-preference");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the light theme by default", async () => {
    render(
      <ThemeProvider>
        <ThemeSelect />
      </ThemeProvider>
    );

    await waitFor(() => expect(document.documentElement).toHaveAttribute("data-theme", "light"));
    expect(screen.getByLabelText("Theme")).toHaveValue("light");
  });

  it("saves a selected theme preference", async () => {
    render(
      <ThemeProvider>
        <ThemeSelect />
      </ThemeProvider>
    );

    fireEvent.change(screen.getByLabelText("Theme"), { target: { value: "dark" } });

    await waitFor(() => expect(document.documentElement).toHaveAttribute("data-theme", "dark"));
    expect(document.documentElement).toHaveAttribute("data-theme-preference", "dark");
    expect(window.localStorage.getItem("phd-workspace-theme")).toBe("dark");
  });

  it("resolves system preference to dark when the system is dark", async () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: true, addEventListener, removeEventListener })
    );

    render(
      <ThemeProvider>
        <ThemeSelect />
      </ThemeProvider>
    );

    fireEvent.change(screen.getByLabelText("Theme"), { target: { value: "system" } });

    await waitFor(() => expect(document.documentElement).toHaveAttribute("data-theme", "dark"));
    expect(document.documentElement).toHaveAttribute("data-theme-preference", "system");
  });
});
