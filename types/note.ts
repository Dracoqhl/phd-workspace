export interface QuickNote {
  id: string;
  tag: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateQuickNoteInput {
  tag?: string;
  title?: string;
  content?: string;
}
