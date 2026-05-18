# Architecture

This document defines the intended project layout and file placement rules for 博士工作台 / PhD Workspace. It should be updated whenever the code structure, ownership boundaries, or dependency rules change.

## Planned File Tree

```text
phd-workspace/
  Readme.md
  architecture.md
  package.json
  scripts/
    start.sh
    start-dev.sh
  next.config.mjs
  tsconfig.json
  tailwind.config.ts
  postcss.config.mjs
  .eslintrc.cjs
  .env.example
  .gitignore

  app/
    layout.tsx
    page.tsx
    globals.css
    api/
      auth/
        login/route.ts
        logout/route.ts
        session/route.ts
      ai/
        test/route.ts
        chat/route.ts
        actions/confirm/route.ts
        logs/route.ts
        care/route.ts
        operations/route.ts
      tasks/route.ts
      habits/route.ts
      habit-checkins/route.ts
      care-records/route.ts
      trash/route.ts

  components/
    app-shell/
      AppShell.tsx
      MainPanel.tsx
      AssistantPanel.tsx
      ResizablePanel.tsx
    care/
      CareCard.tsx
      MoodNoteEditor.tsx
    habits/
      HabitList.tsx
      HabitItem.tsx
      HabitForm.tsx
    tasks/
      TaskManager.tsx
      TaskList.tsx
      TaskItem.tsx
      TaskForm.tsx
      SubtaskList.tsx
      TaskFilters.tsx
    assistant/
      AssistantChat.tsx
      AssistantMessageList.tsx
      OperationConfirmationCard.tsx
      ApiTestButton.tsx
    sync/
      SyncStatusProvider.tsx
    ui/
      Button.tsx
      Dialog.tsx
      Input.tsx
      Select.tsx
      Textarea.tsx
      Badge.tsx

  lib/
    auth/
      password.ts
      session.ts
    ai/
      client.ts
      prompts.ts
      schemas.ts
      operations.ts
      fallback-care.ts
    data/
      data-dir.ts
      json-store.ts
      repositories.ts
      repositories/
        tasks.ts
        habits.ts
        habit-checkins.ts
        care-records.ts
        ai-logs.ts
        trash.ts
    domain/
      tasks.ts
      habits.ts
      care.ts
      assistant.ts
    validation/
      tasks.ts
      habits.ts
      care.ts
      assistant.ts
    time/
      server-date.ts
    utils/
      ids.ts
      errors.ts

  types/
    task.ts
    habit.ts
    care.ts
    assistant.ts
    trash.ts

  docs/
    prd.md

  tests/
    unit/
    integration/
```

The tree is a target structure. Create folders as they become necessary; do not add empty directories just to match the plan.

## Current Implemented Structure

Stage A implemented the first tested backend-only modules, and the current foundation slice extends them into the shared data/auth base:

- `types/task.ts`: task entity, status, priority, due-state, and creation input types.
- `types/trash.ts`: generic trash entry type.
- `lib/domain/tasks.ts`: task completion, subtask progress, and due-date state helpers.
- `lib/data/json-store.ts`: generic versioned JSON store with missing-file initialization, atomic replace writes, flat filename safety, in-process per-file update serialization, and optional item validation.
- `lib/data/repositories.ts`: versioned repository factory exposing tasks, trash, habits, habit check-ins, care records, and AI logs through narrow repository APIs.
- `lib/data/data-dir.ts`: `DATA_DIR` resolver and MVP runtime JSON file list.
- `lib/auth/password.ts` and `lib/auth/session.ts`: legacy password and 30-day session helpers using `APP_PASSWORD` and `SESSION_SECRET`.
- `lib/auth/credentials.ts`: SQLite-mode password hashing and email normalization helpers.
- `lib/db/*`: SQLite path resolution, CLI-backed query wrapper, schema initialization, user/session/invite repositories, and user-scoped business repositories.
- `app/api/auth/*/route.ts`: login, register, logout, and session route handlers. Login/register accept JSON requests from the React form flow and native `application/x-www-form-urlencoded` form posts for mobile/browser fallback.
- `app/api/admin/invites/route.ts`: admin-only one-time invite generation and listing.
- `app/api/tasks/**/route.ts`: protected task list, create, detail, update, delete, and subtask creation route handlers.
- `app/api/habits/**/route.ts`: protected habit list, create, update, deactivate, daily check-in, and daily check-in cancellation route handlers.
- `app/api/care/**/route.ts`: protected today's care, AI-backed refresh with local fallback, care update, and legacy care check-in route handlers backed by `care-records.json`.
- `app/api/ai/test/route.ts`: protected AI connectivity test route handler backed by server-only OpenAI-compatible environment variables.
- `app/api/ai/chat/route.ts`: protected AI chat route handler that builds workspace context from task, habit, care, and bounded recent chat-history repositories before calling the server-side AI chat helper. It persists successful user/assistant messages in SQLite multi-user mode. It may return structured proposals, but it does not write business data.
- `app/api/ai/chat/history/route.ts`: protected SQLite chat-history route handler. It lists recent messages and clears history for only the current authenticated user.
- `app/api/ai/actions/confirm/route.ts`: protected AI proposal confirmation endpoint. It validates selected proposal payloads, executes confirmed task/habit/check-in writes through repositories, links same-batch subtasks to newly created parent tasks, and records action logs.
- `app/api/ai/logs/route.ts`: protected AI action-log listing endpoint backed by `ai-logs.json`.
- `scripts/start.sh`: production helper for personal-server access. It loads `.env.local`, ensures `DATA_DIR`, builds with `next build`, and serves with `next start`.
- `scripts/start-dev.sh`: development helper for active coding only. It runs `next dev`, so route compilation and React development behavior can add noticeable latency and duplicate initial client fetches.

`lib/data/repositories.ts` can later split into `lib/data/repositories/*` files when each feature repository grows. For now it remains a single facade for the foundation slice.

Stage B implemented the first runnable App Router shell and the current task slice connects it to task data:

- `app/layout.tsx`: root document shell, metadata, and global CSS import.
- `app/page.tsx`: MVP workspace page entry point.
- `app/workspace-page-content.tsx`: authenticated workspace layout that composes care, habit, task, and AI assistant regions, with the current habit business date shown in the page header.
- `app/globals.css`: Tailwind directives and base page styling.
- `components/tasks/TaskManager.tsx`: compact hierarchical task table backed by `/api/tasks`, including top-level task create/delete, one-layer subtask create/delete, expandable subtasks, small row-level complete/reopen controls, two-step select-then-edit title editing with blur save, colored status pill editing without a visible dropdown arrow, compact priority dot editing with Low as the default, direct due-date picker access, completed top-level task hiding, and due-state highlighting.
- `components/habits/HabitManager.tsx`: compact habit list backed by `/api/habits`, including panel-level edit mode, bottom-only habit creation with daily target 1-5, editable name and target fields in edit mode, clickable progress fractions for target edits in normal mode, trash-icon deactivate, compact circular check-in/cancel controls, checked-count-over-target header progress, completed-row grey/strikethrough styling, and completed-row sorting. Check-in increments/decrements update local counts and the header progress immediately while the network request syncs in the background.
- `components/care/CarePanel.tsx`: compact mental care card backed by `/api/care`, including per-user batch-cached daily quotes, a gear-triggered quote prompt editor, instant local quote cycling with background sync, local fallback batch, stable title-row energy icons and status pill, bright level-5 amber badge icons, small retry/settings icon actions, and an editable "today focus" field.
- `components/assistant/AiAssistantPanel.tsx`: right-side assistant shell with a compact AI connectivity test control, recent-history loading and clearing, chat area, inline pending response state, `Command+Enter` / `Ctrl+Enter` send shortcuts, safe Markdown rendering for assistant replies, preserved user line breaks, icon-only send control, and selectable proposal confirmation cards. Confirmed task/habit writes dispatch refresh events so the main panels reload newly written data. The desktop panel is sticky, the message log is the scroll container with subtle custom scrollbar styling, and the input stays anchored at the panel bottom.
- `components/sync/SyncStatusProvider.tsx`: client-side provider and badge for page-level `Synced`, `Saving...`, and `Sync failed` state. Feature components wrap write requests with `trackSync` and keep their own rollback snapshots.
- `tests/unit/app/page.test.tsx`: verifies that the workspace regions render.
- `tests/unit/tasks/task-manager.test.tsx`: verifies compact task table loading, expand/collapse, inline title editing, status, priority and due-date editing, completed hiding, subtask creation, and deletion behavior.

Current development also includes the versioned data foundation, auth routes, login shell, protected task APIs, task UI, protected habit APIs, habit UI, protected care APIs/UI, AI-backed care refresh with fallback, protected AI connectivity testing, AI chat, selectable AI operation proposals, AI proposal confirmation, and AI action logging.

## Layer Responsibilities

### `app/`

Owns Next.js routing, page entry points, global styles, and HTTP API route handlers.

- `app/page.tsx` composes the single-page workspace.
- `app/api/**/route.ts` validates requests, calls server-side services or repositories, and returns HTTP responses.
- Route handlers should stay thin. Business rules belong in `lib/domain`, `lib/ai`, or `lib/data`.

### `components/`

Owns React UI components.

- Components may call API endpoints or receive data through props.
- Components must not import from `lib/data`.
- Components must not read environment secrets.
- Components that perform normal non-AI writes should use the sync provider and prefer optimistic local state updates for high-frequency interactions. Completion and check-in actions update visible status/counts immediately, ignore stale older responses when a newer click has happened, and include a short pending visual state before final row movement or hiding.
- Shared low-level UI belongs in `components/ui`.
- Feature-specific UI belongs in its feature folder, such as `components/tasks` or `components/habits`.

### `lib/auth/`

Owns password access and session helpers.

- Password comparison and session cookie signing logic live here.
- Legacy auth uses `APP_PASSWORD` for login and `SESSION_SECRET` for 30-day HTTP-only cookie sessions.
- Multi-user auth is enabled when `DATABASE_PATH` is configured. It uses SQLite users, hashed passwords, database sessions, and one-time invite codes.
- The session cookie protects the shell and should protect future API routes.
- Auth helpers may read `APP_PASSWORD` and `SESSION_SECRET`.
- In multi-user mode, route helpers return the current user context and every business repository is scoped by that `userId`.
- UI components should interact with auth only through API routes or lightweight client state.

### `lib/data/`

Owns server-local JSON persistence.

- `data-dir.ts` resolves and validates legacy `DATA_DIR`.
- `json-store.ts` implements safe JSON reads/writes, including temporary-file writes and atomic replace.
- `JsonStore` is in-process concurrency safe for a single Node.js process. It is not a multi-process file lock. It remains for legacy mode and migration source data.
- `repositories/*` expose typed data operations for each JSON file.
- This layer must not import React components or browser-only APIs.

### `lib/domain/`

Owns business rules that are not tied to HTTP or React.

- Task rules, habit rules, check-in rules, and care-record rules live here.
- Parent and subtask completion must remain independent.
- Due-date highlighting rules belong here or in a small shared helper.
- Daily habit check-ins use a 02:00 server-time day boundary, so 00:00-01:59 belongs to the previous habit business date.
- Habit daily targets are capped at 5 for the current MVP. A habit is completed when `completedCount >= targetCount`.

### `lib/ai/`

Owns AI integration and AI-specific schemas.

- `client.ts` wraps the model API.
- `config.ts` reads `AI_API_KEY`, `AI_MODEL`, and `AI_BASE_URL` only on the server.
- `test-client.ts` calls the OpenAI-compatible `/chat/completions` endpoint for connectivity testing without exposing secrets.
- `care.ts` calls the OpenAI-compatible `/chat/completions` endpoint for mental-care quote batch generation and returns `null` for fallback on any failure.
- `chat.ts` calls the OpenAI-compatible `/chat/completions` endpoint for assistant chat, parses optional structured operation proposals, and returns `null` on any failure so route handlers can respond safely.
- `prompts.ts` stores prompt builders.
- `schemas.ts` defines structured AI response schemas.
- `operations.ts` converts AI responses into pending operation proposals.
- AI code must never write data directly. It returns proposals that API routes can pass to the UI for confirmation.

### `lib/api/`

Owns shared route-handler helpers for protected API slices.

- AI chat request parsing and workspace-context construction live in `lib/api/ai-chat.ts`.
- AI action confirmation parsing and execution live in `lib/api/ai-actions.ts`.
- Context sent to AI includes all task records for the current authenticated user so completed and historical tasks are available for planning, plus a bounded recent chat-history window in SQLite mode. It omits other users' data, secrets, runtime logs, trash, and API keys.

### `lib/validation/`

Owns request and payload validation schemas.

- Keep validation close to public input boundaries.
- Prefer shared schemas over duplicating shape checks in route handlers.

### `lib/time/`

Owns server-date helpers.

- All "today" behavior must use server time.
- Date-only values should be `YYYY-MM-DD`.

### `types/`

Owns shared TypeScript types.

- Types here should describe domain entities and API payloads.
- Avoid importing runtime modules from `types/`.

### `docs/`

Stores product and planning documents.

- The PRD should live in `docs/prd.md` once formalized.
- Architecture changes belong in root `architecture.md`.
- Local Superpowers planning artifacts under `docs/superpowers/` are developer-local and intentionally ignored by Git.

### `tests/`

Owns automated tests.

- Unit tests should cover domain rules, validation, AI operation parsing, and JSON repository behavior.
- Integration tests should cover API routes and core user workflows.

## JSON Data Files

Runtime data should be stored under `DATA_DIR`:

```text
DATA_DIR/
  tasks.json
  habits.json
  habit-checkins.json
  care-records.json
  ai-logs.json
  trash.json
```

All JSON files are versioned collections:

```json
{
  "schemaVersion": 1,
  "items": []
}
```

Recommended responsibilities:

- `tasks.json`: parent tasks and subtasks.
- `habits.json`: habit definitions.
- `habit-checkins.json`: daily habit completion records.
- `care-records.json`: daily mental care content, energy self-assessment, legacy favorite state, and today-focus text.
- `care-quote-preferences.json`: legacy single-user quote prompt and cached quote batch.
- `ai-logs.json`: AI requests, proposed operations, confirmed operations, and failures.
- In SQLite multi-user mode, `ai_chat_messages` stores per-user assistant transcripts with `role`, `content`, and `created_at`. It is scoped by `user_id` and is not shared across users.
- In SQLite multi-user mode, `care_quote_preferences` stores each user's quote prompt, cached quote batch, and current quote index. It is scoped by `user_id` and is not shared across users.
- `trash.json`: deleted records with enough metadata to support future restore.

## Git Boundaries

Git is used for source code, project documentation, tests, scripts, and non-secret configuration examples only.

Commit these:

- application source code
- tests
- `Readme.md`
- `architecture.md`
- product docs under `docs/`
- `.env.example`

Do not commit these:

- real runtime data under `DATA_DIR`
- runtime SQLite databases under `data/`
- `.env` or `.env.*` secret files, except `.env.example`
- AI API keys
- access passwords
- build output such as `.next/`, `dist/`, `build/`, `coverage/`
- logs
- local agent or planning artifacts such as `AGENT.md`, `docs/superpowers/`, `.agents/`, `.codex/`, and `.superpowers/`

If a new generated directory or runtime file appears during development, add it to `.gitignore` before committing.

Trash entries should include:

- `id`
- `deletedType`
- `deletedAt`
- `originalId`
- `originalData`

## Dependency Rules

- `components/**` may import from `types/**`, browser-safe utilities, and feature hooks when they exist.
- `components/**` must not import from `lib/data/**`, `lib/ai/client.ts`, or server-only auth/session modules.
- `app/api/**` may import from `lib/auth`, `lib/data`, `lib/domain`, `lib/ai`, `lib/validation`, and `types`.
- `lib/data/**` may import from `types`, `lib/utils`, and `lib/time`.
- `lib/domain/**` may import from `types`, `lib/time`, and `lib/utils`.
- `lib/ai/**` may import from `types`, `lib/validation`, and `lib/utils`, but must not call repositories directly for writes.
- `types/**` should not import application runtime code.
- Environment variables must be read in server-only modules, not in React client components.

## Naming Rules

- React components use PascalCase file names: `TaskList.tsx`.
- Non-component TypeScript modules use kebab-case or lower descriptive names: `json-store.ts`, `server-date.ts`.
- API routes follow Next.js route-handler naming: `route.ts`.
- Type files use singular domain names: `task.ts`, `habit.ts`.
- JSON data files use lower kebab-case names: `habit-checkins.json`.

## Behavioral Rules

- AI write operations must be represented as pending proposals before execution.
- User confirmation is required before create, update, delete, deactivate, or check-in operations generated by AI. The chat route cannot write data; only the confirmation route can execute selected proposals.
- AI confirmation accepts explicit `taskId`/`habitId` and also tolerates `id` as an alias for existing-entity operations because model output can vary.
- Deleting data moves it to `trash.json`; do not permanently remove it in MVP flows.
- Parent tasks and subtasks do not auto-complete each other.
- Completed tasks are hidden by default in UI, with an explicit show-completed control.
- A task is near due when its due date is within 2 days and it is not completed.
- Overdue unfinished tasks should be visually stronger than near-due tasks.
- AI care generation failure should show a local fallback care message and allow retry.

## Documentation Maintenance

- Update this file when adding, removing, or moving directories.
- Update this file when changing dependency rules or module ownership.
- Update this file when Git boundaries or ignored runtime paths change.
- Update `Readme.md` when setup, scripts, environment variables, deployment, or user-facing scope changes.
- Update local `AGENT.md` when important project decisions are confirmed. It is intentionally ignored by Git.
