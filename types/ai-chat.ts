import type { AiActionProposal } from "@/types/assistant";

export interface AiChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  proposals?: AiActionProposal[];
  createdAt: string;
}
