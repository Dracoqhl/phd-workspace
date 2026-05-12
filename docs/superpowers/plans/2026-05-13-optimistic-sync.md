# Optimistic Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make normal non-AI operations feel immediate while exposing a global sync status badge.

**Architecture:** Add a client `SyncStatusProvider` and `SyncStatusBadge` under the authenticated workspace. Feature components optimistically update local state, wrap API calls with `trackSync`, and roll back on failure.

**Tech Stack:** Next.js App Router, React context/hooks, Tailwind CSS, Vitest and Testing Library.

---

### Task 1: Sync Status Provider

**Files:**
- Create: `components/sync/SyncStatusProvider.tsx`
- Modify: `app/workspace-page-content.tsx`
- Test: `tests/unit/app/page.test.tsx`

- [ ] Add a client provider with `trackSync`, `status`, `lastSyncedAt`, and `error`.
- [ ] Render `SyncStatusBadge` beside the page date for authenticated users.
- [ ] Test that the authenticated page renders a `Synced` badge.

### Task 2: Habit Optimistic Writes

**Files:**
- Modify: `components/habits/HabitManager.tsx`
- Test: `tests/unit/habits/habit-manager.test.tsx`

- [ ] Make check-in and cancellation update the list and progress immediately.
- [ ] Roll back habit state on failed check-in or cancellation.
- [ ] Wrap habit create, update, deactivate, check-in, and cancellation requests with `trackSync`.

### Task 3: Task Optimistic Writes

**Files:**
- Modify: `components/tasks/TaskManager.tsx`
- Test: `tests/unit/tasks/task-manager.test.tsx`

- [ ] Make status, priority, due-date, title, and deletion changes update immediately.
- [ ] Roll back task state on failed writes.
- [ ] Wrap task create, update, delete, and subtask requests with `trackSync`.

### Task 4: Care Optimistic Writes

**Files:**
- Modify: `components/care/CarePanel.tsx`
- Test: `tests/unit/care/care-panel.test.tsx`

- [ ] Optimistically update energy, favorite, and today focus.
- [ ] Roll back care state on failed updates.
- [ ] Keep retry generation server-driven, but show global pending state.

### Task 5: Verification And Docs

**Files:**
- Modify: `AGENT.md`
- Modify: `Readme.md`
- Modify: `architecture.md`

- [ ] Document the global sync badge and optimistic-update behavior.
- [ ] Run `pnpm lint`, `pnpm test`, `pnpm exec tsc --noEmit --pretty false`, and production build.
- [ ] Commit and push the verified version.
