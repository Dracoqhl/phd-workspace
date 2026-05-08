import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { SCHEMA_VERSION, type VersionedCollection } from "@/types/data";

const updateQueuesByFilePath = new Map<string, Promise<unknown>>();

interface JsonStoreOptions<T> {
  validateItem?: (item: unknown) => item is T;
}

export class JsonStore<T> {
  private readonly filePath: string;
  private readonly validateItem?: (item: unknown) => item is T;

  constructor(
    private readonly dataDir: string,
    private readonly fileName: string,
    options: JsonStoreOptions<T> = {}
  ) {
    if (!isAbsolute(dataDir)) {
      throw new Error("JsonStore dataDir must be an absolute path");
    }

    if (isAbsolute(fileName)) {
      throw new Error("JsonStore fileName must be a relative path");
    }

    const resolvedDataDir = resolve(dataDir);
    const resolvedFilePath = resolve(resolvedDataDir, fileName);
    const relativeFilePath = relative(resolvedDataDir, resolvedFilePath);

    if (relativeFilePath === ".." || relativeFilePath.startsWith(`..${sep}`) || isAbsolute(relativeFilePath)) {
      throw new Error("JsonStore fileName must stay inside dataDir");
    }

    if (fileName === "" || fileName.includes("/") || fileName.includes("\\")) {
      throw new Error("JsonStore fileName must be a flat relative filename");
    }

    this.filePath = resolvedFilePath;
    this.validateItem = options.validateItem;
  }

  async read(): Promise<VersionedCollection<T>> {
    await this.ensureFile();
    const content = await readFile(this.filePath, "utf8");
    return parseVersionedCollection<T>(JSON.parse(content), this.validateItem);
  }

  async write(data: VersionedCollection<T>): Promise<void> {
    const directory = dirname(this.filePath);
    await mkdir(directory, { recursive: true });
    const tempPath = join(directory, `.${basename(this.filePath)}.${randomUUID()}.tmp`);
    const content = `${JSON.stringify(data, null, 2)}\n`;

    try {
      await writeFile(tempPath, content, "utf8");
      await rename(tempPath, this.filePath);
    } catch (error) {
      await unlinkIfExists(tempPath);
      throw error;
    }
  }

  async update(
    updater: (
      data: VersionedCollection<T>
    ) => VersionedCollection<T> | Promise<VersionedCollection<T>>
  ): Promise<VersionedCollection<T>> {
    return enqueueFileUpdate(this.filePath, async () => {
      const current = await this.read();
      const next = await updater(current);
      await this.write(next);
      return next;
    });
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
        const directory = dirname(this.filePath);
        const content = `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, items: [] }, null, 2)}\n`;

        await mkdir(directory, { recursive: true });

        try {
          await writeFile(this.filePath, content, { encoding: "utf8", flag: "wx" });
        } catch (writeError) {
          if (!isExistingFileError(writeError)) {
            throw writeError;
          }
        }

        return;
      }

      throw error;
    }
  }
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isExistingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}

async function unlinkIfExists(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }
}

function parseVersionedCollection<T>(
  value: unknown,
  validateItem?: (item: unknown) => item is T
): VersionedCollection<T> {
  if (!isRecord(value)) {
    throw new Error("Invalid versioned collection: expected an object");
  }

  if (value.schemaVersion !== SCHEMA_VERSION) {
    throw new Error("Invalid versioned collection: unsupported schema version");
  }

  if (!Array.isArray(value.items)) {
    throw new Error("Invalid versioned collection: expected items array");
  }

  if (validateItem) {
    value.items.forEach((item, index) => {
      if (!validateItem(item)) {
        throw new Error(`Invalid versioned collection item at index ${index}`);
      }
    });
  }

  return { schemaVersion: SCHEMA_VERSION, items: value.items as T[] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function enqueueFileUpdate<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
  const currentQueue = updateQueuesByFilePath.get(filePath) ?? Promise.resolve();
  const next = currentQueue.then(operation, operation);
  const queued = next.then(
    () => undefined,
    () => undefined
  );

  updateQueuesByFilePath.set(filePath, queued);
  queued.finally(() => {
    if (updateQueuesByFilePath.get(filePath) === queued) {
      updateQueuesByFilePath.delete(filePath);
    }
  });

  return next;
}
