export interface QuickLink {
  id: string;
  groupId: string;
  title: string;
  url: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuickLinkGroup {
  id: string;
  domain: string;
  displayName: string;
  iconUrl: string;
  defaultLinkId: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  links: QuickLink[];
}

export interface CreateQuickLinkInput {
  url: string;
  title?: string;
}

export interface UpdateQuickLinkGroupInput {
  displayName?: string;
}

export interface UpdateQuickLinkInput {
  title?: string;
  url?: string;
}
