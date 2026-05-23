import { afterEach, describe, expect, it, vi } from "vitest";

import { generateAiCareContent, generateAiCareQuoteBatch } from "@/lib/ai/care";

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

describe("generateAiCareQuoteBatch", () => {
  it("returns a sanitized batch from a JSON array response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  "“今天先推进一个最小动作。”",
                  "把复杂问题留给连续的小步。",
                  "",
                  "给自己一点缓冲。"
                ])
              }
            }
          ]
        })
      )
    );

    await expect(generateAiCareQuoteBatch(config, "更短，更适合长期计划", 3)).resolves.toEqual([
      "今天先推进一个最小动作。",
      "把复杂问题留给连续的小步。",
      "给自己一点缓冲。"
    ]);
  });

  it("asks for and enforces 50-character quote limits", async () => {
    const longQuote = "一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十额外内容";
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        choices: [{ message: { content: JSON.stringify([longQuote]) } }]
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateAiCareQuoteBatch(config, "励志诗句", 1)).resolves.toEqual([longQuote.slice(0, 50)]);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).messages[1].content).toContain("under 50 Chinese characters");
  });
});
