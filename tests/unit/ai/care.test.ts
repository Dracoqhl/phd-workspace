import { afterEach, describe, expect, it, vi } from "vitest";

import { generateAiCareContent } from "@/lib/ai/care";

const config = {
  apiKey: "secret-key",
  model: "gpt-test",
  baseUrl: "https://example.test/v1"
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("generateAiCareContent", () => {
  it("returns sanitized content from an OpenAI-compatible response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          choices: [{ message: { content: "“今天先完成一个清晰的小动作。”" } }]
        })
      )
    );

    await expect(generateAiCareContent(config)).resolves.toBe("今天先完成一个清晰的小动作。");
  });

  it("returns null when the endpoint fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "bad key" }, { status: 401 })));

    await expect(generateAiCareContent(config)).resolves.toBeNull();
  });

  it("returns null when the response has no message content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ choices: [{}] })));

    await expect(generateAiCareContent(config)).resolves.toBeNull();
  });
});
