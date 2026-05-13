export type AiActionStatus = "proposed" | "confirmed_executed" | "rejected" | "failed";

export type AiActionType =
  | "create_task"
  | "create_subtask"
  | "update_task"
  | "delete_task"
  | "create_habit"
  | "update_habit"
  | "deactivate_habit"
  | "habit_checkin"
  | "habit_checkin_cancel";

export type AiActionRiskLevel = "low" | "medium" | "high";

export interface AiActionProposal {
  id: string;
  actionType: AiActionType;
  summary: string;
  payload: Record<string, unknown>;
  riskLevel: AiActionRiskLevel;
}

export interface AiActionLog {
  id: string;
  userMessage: string;
  actionType: string;
  actionPayload: unknown;
  status: AiActionStatus;
  createdAt: string;
}
