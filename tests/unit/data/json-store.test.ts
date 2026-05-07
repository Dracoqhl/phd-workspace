import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { JsonStore } from "@/lib/data/json-store";

let tempDir: string | null = null;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("JsonStore", () => {
  it("initializes a missing versioned collection file", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "phd-store-"));
    const store = new JsonStore<string>(tempDir, "items.json");

    await expect(store.read()).resolves.toEqual({ schemaVersion: 1, items: [] });
    await expect(readFile(join(tempDir, "items.json"), "utf8")).resolves.toContain(
      '"schemaVersion": 1'
    );
  });

  it("persists versioned collection updates through a callback", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "phd-store-"));
    const store = new JsonStore<string>(tempDir, "items.json");

    await store.updateItems((items) => [...items, "write"]);

    await expect(store.read()).resolves.toEqual({ schemaVersion: 1, items: ["write"] });
  });

  it("serializes concurrent item updates so all writes survive", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "phd-store-"));
    const store = new JsonStore<number>(tempDir, "items.json");
    await store.read();

    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        store.updateItems(async (items) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return [...items, index];
        })
      )
    );

    const collection = await store.read();
    expect(collection.items).toHaveLength(10);
    expect(new Set(collection.items)).toEqual(new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
  });

  it("writes nested filenames using a temp file next to the target file", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "phd-store-"));
    const store = new JsonStore<string>(tempDir, "nested/items.json");

    await store.updateItems((items) => [...items, "nested"]);

    await expect(readFile(join(tempDir, "nested", "items.json"), "utf8")).resolves.toContain(
      '"nested"'
    );
  });

  it("does not silently overwrite invalid JSON", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "phd-store-"));
    const filePath = join(tempDir, "items.json");
    await mkdir(tempDir, { recursive: true });
    await writeFile(filePath, "{", "utf8");
    const store = new JsonStore<string>(tempDir, "items.json");

    await expect(store.read()).rejects.toThrow();
    await expect(readFile(filePath, "utf8")).resolves.toBe("{");
  });

  it.each([
    ["null", "null"],
    ["wrong schema version", '{\n  "schemaVersion": 2,\n  "items": []\n}\n'],
    ["non-array items", '{\n  "schemaVersion": 1,\n  "items": "nope"\n}\n']
  ])("rejects invalid versioned collection shape: %s", async (_name, content) => {
    tempDir = await mkdtemp(join(tmpdir(), "phd-store-"));
    const filePath = join(tempDir, "items.json");
    await mkdir(tempDir, { recursive: true });
    await writeFile(filePath, content, "utf8");
    const store = new JsonStore<string>(tempDir, "items.json");

    await expect(store.read()).rejects.toThrow();
    await expect(readFile(filePath, "utf8")).resolves.toBe(content);
  });
});
