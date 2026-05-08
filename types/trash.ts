export interface TrashEntry<T = unknown> {
  id: string;
  deletedType: string;
  deletedAt: string;
  originalId: string;
  originalData: T;
}
