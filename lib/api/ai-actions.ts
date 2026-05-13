import { randomUUID } from "node:crypto";

import { getHabitBusinessDate } from "@/lib/domain/habits";
import type { createRepositories } from "@/lib/data/repositories";
import type { AiActionLog, AiActionProposal, AiActionStatus, AiActionType } from "@/types/assistant";
import type { CreateHabitInput, UpdateHabitInput } from "@/types/habit";
import type { CreateTaskInput, TaskPriority, TaskStatus, UpdateTaskInput } from "@/types/task";

export const INVALID_AI_ACTION_PAYLOAD = "Invalid AI action payload";
export const DATA_DIR_CONFIG_ERROR = "Data directory is not configured";

type Repositories = ReturnType<typeof createRepositories>;

export interface AiActionConfirmInput {
  decision: "confirm" | "reject";
  userMessage: string;
  proposals: AiActionProposal[];
}

export interface AiActionResult {
  proposalId: string;
  actionType: AiActionType;
  status: AiActionStatus;
  error?: string;
}

interface AiActionExecutionContext {
  createdTaskIdsByProposalId: Map<string, string>;
  lastCreatedTopLevelTaskId: string | null;
}

export function dataConfigErrorResponse(): Response {
  return Response.json({ error: DATA_DIR_CONFIG_ERROR }, { status: 500 });
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

export function parseAiActionConfirmInput(body: Record<string, unknown>): AiActionConfirmInput | null {
  const decision = body.decision === "reject" ? "reject" : body.decision === undefined || body.decision === "confirm" ? "confirm" : null;
  const userMessage = typeof body.userMessage === "string" ? body.userMessage.trim() : "";
  const proposals = Array.isArray(body.proposals) ? body.proposals.map(parseProposal).filter(isProposal) : null;

  if (!decision || !proposals || proposals.length === 0) {
    return null;
  }

  return { decision, userMessage, proposals };
}

export async function applyAiActionInput(repositories: Repositories, input: AiActionConfirmInput): Promise<AiActionResult[]> {
  const results: AiActionResult[] = [];
  const context: AiActionExecutionContext = {
    createdTaskIdsByProposalId: new Map(),
    lastCreatedTopLevelTaskId: null
  };

  for (const proposal of input.proposals) {
    if (input.decision === "reject") {
      await addLog(repositories, proposal, input.userMessage, "rejected");
      results.push({ proposalId: proposal.id, actionType: proposal.actionType, status: "rejected" });
      continue;
    }

    try {
      await executeProposal(repositories, proposal, context);
      await addLog(repositories, proposal, input.userMessage, "confirmed_executed");
      results.push({ proposalId: proposal.id, actionType: proposal.actionType, status: "confirmed_executed" });
    } catch (caught) {
      await addLog(repositories, proposal, input.userMessage, "failed");
      results.push({
        proposalId: proposal.id,
        actionType: proposal.actionType,
        status: "failed",
        error: caught instanceof Error ? caught.message : "AI action failed"
      });
    }
  }

  return results;
}

async function executeProposal(
  repositories: Repositories,
  proposal: AiActionProposal,
  context: AiActionExecutionContext
): Promise<void> {
  if (proposal.actionType === "create_task") {
    const task = await repositories.tasks.create(parseCreateTaskPayload(proposal.payload, null));
    context.createdTaskIdsByProposalId.set(proposal.id, task.id);
    context.lastCreatedTopLevelTaskId = task.id;
    return;
  }

  if (proposal.actionType === "create_subtask") {
    const parentTaskId = resolveSubtaskParentTaskId(proposal.payload, context);
    await repositories.tasks.create(parseCreateTaskPayload(proposal.payload, parentTaskId));
    return;
  }

  if (proposal.actionType === "update_task") {
    const taskId = parseRequiredString(proposal.payload.taskId);
    const input = parseUpdateTaskPayload(proposal.payload);
    const updated = await repositories.tasks.update(taskId, input);
    if (!updated) throw new Error("Task not found");
    return;
  }

  if (proposal.actionType === "delete_task") {
    const taskId = parseRequiredString(proposal.payload.taskId);
    const existing = await repositories.tasks.get(taskId);
    if (!existing) throw new Error("Task not found");
    await repositories.tasks.delete(taskId);
    return;
  }

  if (proposal.actionType === "create_habit") {
    await repositories.habits.create(parseCreateHabitPayload(proposal.payload));
    return;
  }

  if (proposal.actionType === "update_habit") {
    const habitId = parseRequiredString(proposal.payload.habitId);
    const input = parseUpdateHabitPayload(proposal.payload);
    const updated = await repositories.habits.update(habitId, input);
    if (!updated) throw new Error("Habit not found");
    return;
  }

  if (proposal.actionType === "deactivate_habit") {
    const habitId = parseRequiredString(proposal.payload.habitId);
    const updated = await repositories.habits.deactivate(habitId);
    if (!updated) throw new Error("Habit not found");
    return;
  }

  if (proposal.actionType === "habit_checkin" || proposal.actionType === "habit_checkin_cancel") {
    const habitId = parseRequiredString(proposal.payload.habitId);
    const habit = await repositories.habits.get(habitId);
    if (!habit) throw new Error("Habit not found");
    if (proposal.actionType === "habit_checkin") {
      await repositories.habitCheckins.complete(habitId, getHabitBusinessDate(), habit.targetCount);
    } else {
      await repositories.habitCheckins.decrement(habitId, getHabitBusinessDate(), habit.targetCount);
    }
  }
}

function resolveSubtaskParentTaskId(payload: Record<string, unknown>, context: AiActionExecutionContext): string {
  if (typeof payload.parentTaskId === "string" && payload.parentTaskId.trim()) {
    return payload.parentTaskId.trim();
  }

  if (typeof payload.parentProposalId === "string" && payload.parentProposalId.trim()) {
    const parentTaskId = context.createdTaskIdsByProposalId.get(payload.parentProposalId.trim());
    if (parentTaskId) {
      return parentTaskId;
    }
  }

  if (context.lastCreatedTopLevelTaskId) {
    return context.lastCreatedTopLevelTaskId;
  }

  throw new Error("Subtask parent not found");
}

function parseProposal(value: unknown): AiActionProposal | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" && value.id.trim() ? value.id.trim() : randomUUID();
  const actionType = parseActionType(value.actionType);
  const summary = typeof value.summary === "string" ? value.summary.trim() : "";
  const payload = isRecord(value.payload) ? value.payload : null;

  if (!actionType || !summary || !payload) return null;

  return {
    id,
    actionType,
    summary,
    payload,
    riskLevel: value.riskLevel === "medium" || value.riskLevel === "high" ? value.riskLevel : "low"
  };
}

function parseCreateTaskPayload(payload: Record<string, unknown>, parentTaskId: string | null): CreateTaskInput {
  return {
    title: parseRequiredString(payload.title),
    description: typeof payload.description === "string" ? payload.description : "",
    status: parseStatus(payload.status, "not_started"),
    priority: parsePriority(payload.priority, "medium"),
    dueDate: parseDateOrNull(payload.dueDate),
    parentTaskId
  };
}

function parseUpdateTaskPayload(payload: Record<string, unknown>): UpdateTaskInput {
  const input: UpdateTaskInput = {};
  if ("title" in payload) input.title = parseRequiredString(payload.title);
  if ("description" in payload) input.description = parseString(payload.description);
  if ("status" in payload) input.status = parseStatus(payload.status);
  if ("priority" in payload) input.priority = parsePriority(payload.priority);
  if ("dueDate" in payload) input.dueDate = parseDateOrNull(payload.dueDate);
  return input;
}

function parseCreateHabitPayload(payload: Record<string, unknown>): CreateHabitInput {
  return {
    name: parseRequiredString(payload.name),
    description: typeof payload.description === "string" ? payload.description : "",
    icon: typeof payload.icon === "string" ? payload.icon : "",
    targetCount: parseTargetCount(payload.targetCount, 1)
  };
}

function parseUpdateHabitPayload(payload: Record<string, unknown>): UpdateHabitInput {
  const input: UpdateHabitInput = {};
  if ("name" in payload) input.name = parseRequiredString(payload.name);
  if ("description" in payload) input.description = parseString(payload.description);
  if ("icon" in payload) input.icon = parseString(payload.icon);
  if ("targetCount" in payload) input.targetCount = parseTargetCount(payload.targetCount);
  return input;
}

async function addLog(
  repositories: Repositories,
  proposal: AiActionProposal,
  userMessage: string,
  status: AiActionStatus
): Promise<AiActionLog> {
  return repositories.aiLogs.add({
    id: randomUUID(),
    userMessage,
    actionType: proposal.actionType,
    actionPayload: proposal.payload,
    status,
    createdAt: new Date().toISOString()
  });
}

function parseActionType(value: unknown): AiActionType | null {
  return value === "create_task" ||
    value === "create_subtask" ||
    value === "update_task" ||
    value === "delete_task" ||
    value === "create_habit" ||
    value === "update_habit" ||
    value === "deactivate_habit" ||
    value === "habit_checkin" ||
    value === "habit_checkin_cancel"
    ? value
    : null;
}

function parseStatus(value: unknown, fallback?: TaskStatus): TaskStatus {
  if (value === undefined && fallback) return fallback;
  if (value === "not_started" || value === "in_progress" || value === "paused" || value === "completed") return value;
  throw new Error("Invalid task status");
}

function parsePriority(value: unknown, fallback?: TaskPriority): TaskPriority {
  if (value === undefined && fallback) return fallback;
  if (value === "low" || value === "medium" || value === "high") return value;
  throw new Error("Invalid task priority");
}

function parseDateOrNull(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  throw new Error("Invalid date");
}

function parseTargetCount(value: unknown, fallback?: number): number {
  if (value === undefined && fallback) return fallback;
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5) return value;
  throw new Error("Invalid habit target");
}

function parseRequiredString(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Invalid text");
  }
  return value.trim();
}

function parseString(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid text");
  return value;
}

function isProposal(value: AiActionProposal | null): value is AiActionProposal {
  return value !== null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
