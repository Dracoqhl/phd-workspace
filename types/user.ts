export type UserRole = "admin" | "user";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface PublicUser {
  email: string;
  role: UserRole;
}

export interface InviteCode {
  id: string;
  code: string;
  createdByUserId: string;
  consumedByUserId: string | null;
  consumedAt: string | null;
  createdAt: string;
}
