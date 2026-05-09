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
    energyLevel: null,
    isFavorite: false,
    focusText: "",
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

    if (url === "/api/care/update" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as Partial<CareRecord>;
      current = care({
        ...current,
        energyLevel: body.energyLevel ?? current.energyLevel,
        isFavorite: body.isFavorite ?? current.isFavorite,
        focusText: body.focusText ?? current.focusText
      });
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
    expect(screen.getByTestId("care-energy-row")).toContainElement(screen.getByText("Energy"));
    expect(screen.getByTestId("care-quote-panel")).toContainElement(screen.getByText("Daily quote"));
    expect(screen.getByText("Daily quote")).toBeInTheDocument();
    expect(screen.getByText("Energy")).toBeInTheDocument();
    expect(screen.getByText("Not set")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry care message" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Favorite care message" })).toBeInTheDocument();
    expect(screen.getByLabelText("Today focus")).toHaveAttribute("placeholder", "今天最想完成的一件事...");
  });

  it("retries the care message", async () => {
    const fetchMock = mockFetch(care());

    render(<CarePanel />);

    fireEvent.click(await screen.findByRole("button", { name: "Retry care message" }));

    expect(await screen.findByText("给自己一点缓冲，稳定推进。")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/care/generate", expect.objectContaining({ method: "POST" }));
  });

  it("updates the energy level with distinct icon feedback", async () => {
    const fetchMock = mockFetch(care());

    render(<CarePanel />);

    fireEvent.click(await screen.findByRole("button", { name: "Set energy to 1" }));

    expect(await screen.findByText("Low energy")).toBeInTheDocument();
    expect(screen.getByTestId("energy-broken-heart")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/care/update",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ energyLevel: 1 }) })
    );

    fireEvent.click(screen.getByRole("button", { name: "Set energy to 5" }));

    expect(await screen.findByText("Bright")).toBeInTheDocument();
    const suns = screen.getAllByTestId("energy-sun");
    expect(suns).toHaveLength(5);
    expect(suns[0]).toHaveClass("bg-amber-400", "text-white");
    expect(screen.queryByTestId("energy-sun-icon")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/care/update",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ energyLevel: 5 }) })
    );
  });

  it("toggles favorite state with star icons", async () => {
    const fetchMock = mockFetch(care());

    render(<CarePanel />);

    fireEvent.click(await screen.findByRole("button", { name: "Favorite care message" }));
    expect(await screen.findByRole("button", { name: "Unfavorite care message" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/care/update",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ isFavorite: true }) })
    );

    fireEvent.click(screen.getByRole("button", { name: "Unfavorite care message" }));
    expect(await screen.findByRole("button", { name: "Favorite care message" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/care/update",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ isFavorite: false }) })
    );
  });

  it("saves today's focus text on blur", async () => {
    const fetchMock = mockFetch(care());

    render(<CarePanel />);

    const input = await screen.findByLabelText("Today focus");
    fireEvent.change(input, { target: { value: "Finish one figure" } });
    fireEvent.blur(input);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/care/update",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ focusText: "Finish one figure" }) })
    );
  });
});
