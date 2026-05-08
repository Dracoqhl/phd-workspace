import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
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
  it("rejects a relative data directory", () => {
    expect(() => new JsonStore<string>("relative-data", "items.json")).toThrow(
      "JsonStore dataDir must be an absolute path"
    );
  });

  it("rejects an absolute file name", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "phd-store-"));

    expect(() => new JsonStore<string>(tempDir!, join(tempDir!, "items.json"))).toThrow(
      "JsonStore fileName must be a relative path"
    );
  });

  it("rejects a file name that escapes the data directory", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "phd-store-"));

    expect(() => new JsonStore<string>(tempDir!, "../items.json")).toThrow(
      "JsonStore fileName must stay inside dataDir"
    );
  });

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

  it("does not let concurrent first read initialization overwrite first update", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "phd-store-"));

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const fileName = `items-${attempt}.json`;
      const reader = new JsonStore<string>(tempDir, fileName);
      const writer = new JsonStore<string>(tempDir, fileName);

      await Promise.all([
        reader.read(),
        writer.updateItems(async (items) => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          return [...items, "survives"];
        })
      ]);

      await expect(reader.read()).resolves.toEqual({ schemaVersion: 1, items: ["survives"] });
    }
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

  it("serializes concurrent item updates across store instances for the same file", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "phd-store-"));
    const firstStore = new JsonStore<number>(tempDir, "items.json");
    const secondStore = new JsonStore<number>(tempDir, "items.json");
    await firstStore.read();

    await Promise.all(
      Array.from({ length: 10 }, (_, index) => {
        const store = index % 2 === 0 ? firstStore : secondStore;

        return store.updateItems(async (items) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return [...items, index];
        });
      })
    );

    const collection = await firstStore.read();
    expect(collection.items).toHaveLength(10);
    expect(new Set(collection.items)).toEqual(new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
  });

  it("rejects nested file names", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "phd-store-"));

    expect(() => new JsonStore<string>(tempDir!, "nested/items.json")).toThrow(
      "JsonStore fileName must be a flat relative filename"
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

  it("rejects invalid items when an item validator is configured", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "phd-store-"));
    const filePath = join(tempDir, "items.json");
    await mkdir(tempDir, { recursive: true });
    await writeFile(
      filePath,
      '{\n  "schemaVersion": 1,\n  "items": ["valid", 7]\n}\n',
      "utf8"
    );
    const store = new JsonStore<string>(tempDir, "items.json", {
      validateItem: (item): item is string => typeof item === "string"
    });

    await expect(store.read()).rejects.toThrow("Invalid versioned collection item at index 1");
  });

  it("removes temp files when a write fails", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "phd-store-"));
    await mkdir(join(tempDir, "items.json"));
    const store = new JsonStore<string>(tempDir, "items.json");

    await expect(store.write({ schemaVersion: 1, items: ["write"] })).rejects.toThrow();
    const files = await readdir(tempDir);
    expect(files.filter((fileName) => fileName.includes(".tmp"))).toEqual([]);
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
