export type AiActionStatus = "proposed" | "confirmed_executed" | "rejected" | "failed";

export interface AiActionLog {
  id: string;
  userMessage: string;
  actionType: string;
  actionPayload: unknown;
  status: AiActionStatus;
  createdAt: string;
}
