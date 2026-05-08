import { describe, expect, it } from "vitest";

import { getHabitBusinessDate } from "@/lib/domain/habits";

describe("habit domain", () => {
  it("keeps habit check-ins on the previous business date before 02:00 server time", () => {
    expect(getHabitBusinessDate(new Date(2026, 4, 8, 1, 59, 59))).toBe("2026-05-07");
  });

  it("rolls habit check-ins to the current business date at 02:00 server time", () => {
    expect(getHabitBusinessDate(new Date(2026, 4, 8, 2, 0, 0))).toBe("2026-05-08");
  });
});
