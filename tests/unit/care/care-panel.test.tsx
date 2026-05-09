import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CarePanel } from "@/components/care/CarePanel";
import type { CareRecord } from "@/types/care";

const now = "2026-05-08T08:00:00.000Z";

function care(overrides: Partial<CareRecord> = {}): CareRecord {
  return {
    id: "care_1",
    date: "2026-05-08",
    content: "今天先完成一个清晰的小动作。",
    source: "fallback",
    isChecked: false,
    moodNote: "",
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function mockFetch(initial: CareRecord) {
  let current = initial;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url === "/api/care/today" && method === "GET") {
      return Response.json({ care: current });
    }

    if (url === "/api/care/generate" && method === "POST") {
      current = care({ ...current, content: "给自己一点缓冲，稳定推进。" });
      return Response.json({ care: current });
    }

    if (url === "/api/care/checkin" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as Partial<CareRecord>;
      current = care({ ...current, isChecked: Boolean(body.isChecked), moodNote: String(body.moodNote ?? "") });
      return Response.json({ care: current });
    }

    throw new Error(`Unexpected request ${method} ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CarePanel", () => {
  it("loads and displays today's care content", async () => {
    mockFetch(care());

    render(<CarePanel />);

    expect(await screen.findByText("今天先完成一个清晰的小动作。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check in care" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry care message" })).toBeInTheDocument();
  });

  it("retries the care message", async () => {
    const fetchMock = mockFetch(care());

    render(<CarePanel />);

    fireEvent.click(await screen.findByRole("button", { name: "Retry care message" }));

    expect(await screen.findByText("给自己一点缓冲，稳定推进。")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/care/generate", expect.objectContaining({ method: "POST" }));
  });

  it("checks in with a mood note", async () => {
    const fetchMock = mockFetch(care());

    render(<CarePanel />);

    fireEvent.change(await screen.findByLabelText("Mood note"), { target: { value: "Calmer now" } });
    fireEvent.click(screen.getByRole("button", { name: "Check in care" }));

    expect(await screen.findByRole("button", { name: "Care checked" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/care/checkin",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ isChecked: true, moodNote: "Calmer now" }) })
    );
  });
});
