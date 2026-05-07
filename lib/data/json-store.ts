import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";

import { SCHEMA_VERSION, type VersionedCollection } from "@/types/data";

export class JsonStore<T> {
  private readonly filePath: string;
  private updateQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly dataDir: string,
    private readonly fileName: string
  ) {
    this.filePath = join(dataDir, fileName);
  }

  async read(): Promise<VersionedCollection<T>> {
    await this.ensureFile();
    const content = await readFile(this.filePath, "utf8");
    return parseVersionedCollection<T>(JSON.parse(content));
  }

  async write(data: VersionedCollection<T>): Promise<void> {
    const directory = dirname(this.filePath);
    await mkdir(directory, { recursive: true });
    const tempPath = join(directory, `.${basename(this.filePath)}.${randomUUID()}.tmp`);
    const content = `${JSON.stringify(data, null, 2)}\n`;

    await writeFile(tempPath, content, "utf8");
    await rename(tempPath, this.filePath);
  }

  async update(
    updater: (
      data: VersionedCollection<T>
    ) => VersionedCollection<T> | Promise<VersionedCollection<T>>
  ): Promise<VersionedCollection<T>> {
    const operation = this.updateQueue.then(async () => {
      const current = await this.read();
      const next = await updater(current);
      await this.write(next);
      return next;
    });

    this.updateQueue = operation.then(
      () => undefined,
      () => undefined
    );

    return operation;
  }

  async updateItems(updater: (items: T[]) => T[] | Promise<T[]>): Promise<T[]> {
    const next = await this.update(async (collection) => ({
      schemaVersion: SCHEMA_VERSION,
      items: await updater(collection.items)
    }));
    return next.items;
  }

  private async ensureFile(): Promise<void> {
    try {
      await readFile(this.filePath, "utf8");
    } catch (error) {
      if (isMissingFileError(error)) {
        await this.write({ schemaVersion: SCHEMA_VERSION, items: [] });
        return;
      }

      throw error;
    }
  }
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function parseVersionedCollection<T>(value: unknown): VersionedCollection<T> {
  if (!isRecord(value)) {
    throw new Error("Invalid versioned collection: expected an object");
  }

  if (value.schemaVersion !== SCHEMA_VERSION) {
    throw new Error("Invalid versioned collection: unsupported schema version");
  }

  if (!Array.isArray(value.items)) {
    throw new Error("Invalid versioned collection: expected items array");
  }

  return value as VersionedCollection<T>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
