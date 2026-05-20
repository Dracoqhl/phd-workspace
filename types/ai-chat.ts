import type { AiActionProposal } from "@/types/assistant";

export type AiChatActionState = "pending" | "executed" | "rejected" | "failed";

export interface AiChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  proposals?: AiActionProposal[];
  actionState?: AiChatActionState;
  actionStatus?: string;
  createdAt: string;
}
