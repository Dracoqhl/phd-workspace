export const SCHEMA_VERSION = 1;

export interface VersionedCollection<T> {
  schemaVersion: typeof SCHEMA_VERSION;
  items: T[];
}
