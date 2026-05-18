# 博士工作台 / PhD Workspace

博士工作台是一个轻量级个人博士工作台，用于管理科研任务、每日健康习惯、心灵关怀打卡，并通过页面内 AI 助手辅助梳理和维护任务体系。

当前项目处于可用的 private beta 阶段，已包含多用户账号、任务管理、每日健康习惯、AI 心灵关怀批量 Quote 缓存、AI API 测试入口、右侧 AI 聊天、AI 对话历史、AI 操作建议确认、AI 操作日志，以及 SQLite 数据存储。
普通非 AI 操作使用页面级同步状态提示：页面日期旁显示 `Synced`、`Saving...` 或 `Sync failed`。高频编辑会先更新界面，再在后台同步到本地 JSON API；任务完成和习惯打卡会先显示短暂 pending 高亮，再进入最终完成/置底/隐藏状态。

## Product Scope

P0 功能：

- 单页面工作台。
- 心灵关怀模块：每日 Quote、可编辑 Quote 生成提示词、批量预生成缓存、默认提示词与默认 Quote 批次本地重置、即时刷新切换、能量自评、今日 focus、失败 fallback。
- 每日健康习惯模块：创建、编辑、停用、完成/未完成打卡。
- 任务模块：一级任务、一层子任务、状态、优先级、截止日期、完成隐藏、接近截止/逾期高亮。
- 右侧常驻 AI 助手：项目范围内聊天、历史记录、API 测试、任务拆解、操作建议、勾选确认后写入。AI 助手仅用于维护任务、习惯、计划和 Quote 设置；明显无关、恶意或索要密钥/系统信息的请求会在后端拦截。
- 邀请制多用户账号，邮箱 + 密码登录。
- SQLite 多用户数据存储；未配置 `DATABASE_PATH` 时仍可使用 legacy 单口令 JSON 模式。

暂不做：

- 团队协作、复杂权限系统。
- 运行数据通过 Git 同步。
- 多级子任务。
- 通知提醒。
- 文献管理、PDF 精读、引用管理。
- 医疗级心理健康诊断或咨询替代功能。

## Planned Stack

推荐技术方案：

- Next.js + React
- Tailwind CSS
- Next.js Route Handlers
- SQLite for multi-user runtime data; legacy server-local JSON files remain as migration source
- Server-side AI model API integration

最终技术栈以后续实际初始化项目为准。若技术栈变化，需要同步更新本文件和 `architecture.md`。

## Local Setup

Install dependencies:

```bash
pnpm install
```

For multi-user mode, the server must have the `sqlite3` CLI available on `PATH`.

Create local environment configuration:

```bash
cp .env.example .env.local
```

Required variables:

```bash
SESSION_SECRET=replace-with-a-long-random-secret
DATA_DIR=/absolute/path/to/phd-workspace-data
DATABASE_PATH=/absolute/path/to/phd-workspace.sqlite
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=replace-with-admin-password
AI_API_KEY=your-model-api-key
AI_MODEL=your-model-name
AI_BASE_URL=https://api.openai.com/v1
```

- `APP_PASSWORD` is only used by legacy single-user mode when `DATABASE_PATH` is not configured.
- `SESSION_SECRET` signs the 30-day HTTP-only session cookie. Use a long random value.
- `DATA_DIR` points to legacy runtime JSON data outside the repository and is used as the source for JSON-to-SQLite migration.
- `DATABASE_PATH` enables invite-only multi-user mode and points to the SQLite database file.
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` initialize the first admin user when the SQLite database has no users.
- `AI_API_KEY` is the server-side model API key used by `/api/ai/test`, `/api/care/generate`, and `/api/ai/chat`.
- `AI_MODEL` is the OpenAI-compatible model name used by the server-side AI client.
- `AI_BASE_URL` is the OpenAI-compatible model API base URL, such as `https://api.openai.com/v1`.
- Fill real AI values only in `.env.local` on your machine or server. `.env.local` is ignored by Git and must not be committed.

Run the app for normal server access with the production helper script:

```bash
./scripts/start.sh
```

The production script loads `.env.local` when present, creates `DATA_DIR` when needed, builds the optimized Next.js app, binds the server to `0.0.0.0`, and uses port `3000` by default. You can override the port with `PORT=3001 ./scripts/start.sh`.

Use the development helper only while actively changing code:

```bash
./scripts/start-dev.sh
```

The development script runs `next dev`, which performs on-demand route compilation and can intentionally duplicate some client requests in React development mode. It is useful for coding, but it is slower than production mode and is not the recommended way to serve the workspace for daily use.

You can also run the underlying dev command directly:

```bash
pnpm dev
```

Open `http://localhost:3000`. In multi-user mode, log in with `ADMIN_EMAIL` and `ADMIN_PASSWORD` to enter the admin dashboard, then generate and copy single-use invite codes for beta users. In legacy mode, enter `APP_PASSWORD`. The login/register forms support both the normal React flow and native HTML form POST fallback for mobile browsers.

## Environment Variables

Example variables:

```bash
APP_PASSWORD=change-me
SESSION_SECRET=replace-with-a-long-random-secret
DATA_DIR=/absolute/path/to/phd-workspace-data
DATABASE_PATH=/absolute/path/to/phd-workspace.sqlite
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=replace-with-admin-password
AI_API_KEY=your-model-api-key
AI_MODEL=your-model-name
AI_BASE_URL=https://api.openai.com/v1
```

Rules:

- `APP_PASSWORD` is the single access password.
- `SESSION_SECRET` signs session cookies and must be a long random value.
- `DATA_DIR` points to runtime JSON data outside the repository.
- `DATABASE_PATH` enables SQLite multi-user mode.
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` are used only to initialize the first admin user when the SQLite database is empty.
- `AI_BASE_URL` is required for the upcoming server-side AI client configuration.
- `AI_API_KEY`, `AI_MODEL`, and `AI_BASE_URL` are read only on the server. The frontend calls protected AI API routes and never receives the API key.
- AI keys must only be used server-side.
- Real `.env` files should not be committed.

To configure AI locally or on the server, edit `.env.local`:

```bash
AI_API_KEY=sk-...
AI_MODEL=your-model-name
AI_BASE_URL=https://api.openai.com/v1
```

After editing `.env.local`, restart the app and click `Test AI` in the right assistant panel.

## Runtime Data

Legacy JSON runtime data should live outside this repo:

```text
$DATA_DIR/
  tasks.json
  habits.json
  habit-checkins.json
  care-records.json
  ai-logs.json
  trash.json
```

Each runtime JSON file is a versioned collection:

```json
{
  "schemaVersion": 1,
  "items": []
}
```

For multi-user mode, set `DATABASE_PATH` to an absolute SQLite file path outside this repo. Back up this SQLite file regularly.

To migrate existing single-user JSON data into the admin account:

```bash
DATA_DIR=/absolute/path/to/phd-workspace-data \
DATABASE_PATH=/absolute/path/to/phd-workspace.sqlite \
ADMIN_EMAIL=admin@example.com \
ADMIN_PASSWORD=replace-with-admin-password \
pnpm migrate:sqlite
```

The migration keeps old JSON files in place as backup and records a migration marker so repeated runs do not duplicate data.

## Git And GitHub Sync

This project should use Git for source code and documentation. Normal development should be synced to a personal GitHub repository.

Collaboration rule: after each completed, verified development version, the maintainer should commit the version and push it to GitHub.

Recommended GitHub repository settings:

- Repository name: `phd-workspace`.
- Visibility: private, unless you intentionally want the code to be public.
- Do not commit runtime JSON data or real environment files.

Git should include:

- source code
- tests
- project documentation
- example config such as `.env.example`

Git must not include:

- real runtime JSON data
- runtime SQLite databases
- `.env` secret files
- API keys
- access passwords
- logs
- build output
- local agent or planning artifacts such as `AGENT.md`, `docs/superpowers/`, `.agents/`, `.codex/`, and `.superpowers/`

Recommended first-time setup after creating the GitHub repository:

```bash
git init
git add Readme.md architecture.md .gitignore .env.example
git commit -m "Initialize project documentation"
git branch -M main
git remote add origin git@github.com:<your-user>/<your-repo>.git
git push -u origin main
```

Use SSH remote URLs if possible. If HTTPS is preferred, replace the remote URL with:

```bash
git remote add origin https://github.com/<your-user>/<your-repo>.git
```

## Development Status

The project is in private beta implementation. Current dev status includes a versioned data foundation, multi-user auth routes, an admin dashboard for invite/user oversight, protected task APIs, task management UI, daily habit management UI, AI-backed mental care with fallback, AI API testing, AI chat, selectable AI operation proposals, confirmed AI writes, and AI action logging.

- `architecture.md`: planned directory layout and file placement rules.
- `Readme.md`: project overview, product scope, and setup expectations.
- `.gitignore`: Git ignore rules for dependencies, secrets, build output, logs, and runtime data.
- `.env.example`: example environment variable names without real secrets.
- `.eslintrc.cjs`: ESLint configuration for the current TypeScript/React app.
- `app/layout.tsx`: root App Router layout and metadata.
- `app/page.tsx`: page entry that renders the login/register shell, the normal user workspace, or the admin dashboard depending on authentication state and role.
- `app/globals.css`: Tailwind entry point, CSS variable theme tokens, semantic state colors, separate low-chroma large-area colors for care/proposal/due rows, themed custom scrollbars, and theme compatibility overrides.
- `components/theme/ThemeProvider.tsx`: compact theme selector for `Light`, `Dark`, `Forest`, `Warm`, and `System`. Theme preference is stored locally in the browser and applied before React hydration to reduce theme flash.
- `components/admin/AdminDashboard.tsx`: admin-only dashboard connected to `/api/admin/overview` and `/api/admin/invites`, with aggregate stats, single-use invite-code status, copy controls, and registered-user task/habit counts.
- `components/sync/SyncStatusProvider.tsx`: client-side sync status provider and badge for optimistic UI feedback.
- `components/care/CarePanel.tsx`: compact mental care panel connected to `/api/care/today`, `/api/care/generate`, and `/api/care/update`, with per-user batch-cached daily quotes, a gear-triggered quote prompt editor, local default prompt + default batch reset without an AI call, instant local quote cycling, local fallback batch, stable title-row energy icons and status pill, bright level-5 amber badge feedback, small retry/settings icon actions, and an editable "today focus" field. Returned quote items are capped server-side at 50 Chinese characters for stable display.
- `components/assistant/AiAssistantPanel.tsx`: right-side assistant shell with a compact `Test AI` control connected to `/api/ai/test`, chat connected to `/api/ai/chat`, recent history connected to `/api/ai/chat/history`, and selectable proposal cards that confirm selected writes through `/api/ai/actions/confirm`. Pending proposal cards are restored from saved assistant history after refresh. Confirmed task/habit writes refresh the main panels, the proposal buttons use short `Apply` / `Cancel` labels, sent messages immediately show an inline `Thinking...` assistant state, `Command+Enter` / `Ctrl+Enter` sends multiline input, assistant replies render safe Markdown, and the send control is icon-only for the narrow assistant panel. On desktop the panel is sticky, message history scrolls independently with subtle custom scrollbars, and the input stays at the panel bottom.
- `components/tasks/TaskManager.tsx`: compact hierarchical task table connected to `/api/tasks`, including top-level task create/delete, one-layer subtask create/delete, expandable subtasks, small row-level complete/reopen controls, two-step select-then-edit title editing with blur save, colored status pill editing without a visible dropdown arrow, compact priority dot editing with Low as the default, direct due-date picker access, completed top-level task hiding, and due-date highlighting.
- `components/habits/HabitManager.tsx`: compact daily habit list connected to `/api/habits`, including a panel-level edit mode, bottom-only new-habit form, row-wide name/target maintenance in edit mode, clickable progress fractions for target changes in normal mode, trash-icon deactivation, compact circular complete/cancel controls, checked-count-over-target header progress, and multi-check cancellation behavior. Check-in counts and the header progress bar update immediately before the background sync finishes. Completed habits are greyed out, struck through, and sorted after incomplete habits.
- `app/globals.css`: Tailwind entry point and base page styles.
- `types/task.ts`: task entity and task input types.
- `types/habit.ts`: habit, habit check-in, habit input, and API list item types.
- `types/trash.ts`: trash entry type.
- `lib/domain/tasks.ts`: task completion, subtask progress, and due-state business rules.
- `lib/domain/habits.ts`: habit business-date helper using a 02:00 server-time day boundary and habit list sorting rules.
- `lib/domain/care.ts`: care date helper plus local fallback and AI-generated care record construction.
- `lib/ai/config.ts`, `lib/ai/test-client.ts`, `lib/ai/care.ts`, and `lib/ai/chat.ts`: server-only OpenAI-compatible AI configuration, connectivity test helper, mental-care generation helper, and project-scoped assistant chat helper.
- `lib/api/ai-chat.ts`: AI chat payload parsing, current-user workspace context building, and input/output boundary guards that prevent out-of-scope chat, credential extraction, system-prompt disclosure, and unsafe model replies.
- `lib/data/json-store.ts`: JSON file initialization, read, update, and atomic write helper.
- `lib/data/repositories.ts`: versioned repository factory for tasks, trash, habits, habit check-ins, care records, and AI logs.
- `app/api/tasks/**/route.ts`: protected task list, create, detail, update, delete, and subtask creation endpoints.
- `app/api/habits/**/route.ts`: protected habit list, create, update, deactivate, check-in, and check-in cancellation endpoints.
- `app/api/care/**/route.ts`: protected today's care, AI-backed refresh with fallback, care update, and legacy care check-in endpoints.
- `app/api/ai/test/route.ts`: protected AI connectivity test endpoint. It returns only availability state and never returns the configured API key.
- `app/api/ai/chat/route.ts`: protected AI chat endpoint. It sends workspace context including all task records, active habits with today's progress, today's care summary, and a bounded recent chat history window to the configured model. It may return structured operation proposals but does not execute writes.
- `app/api/ai/chat/history/route.ts`: protected multi-user SQLite chat history endpoint. It returns recent messages and any pending assistant proposals for the current authenticated user, and can clear only that user's saved transcript.
- `app/api/ai/actions/confirm/route.ts`: protected endpoint that validates and executes selected AI proposals after user confirmation. Same-batch subtasks can reference a new parent task by `parentProposalId`, and missing subtask parent IDs fall back to the most recently created top-level task in that confirmation batch.
- `app/api/ai/logs/route.ts`: protected endpoint for reading `ai-logs.json`.
- `tests/`: unit tests for task and habit domain rules, JSON data layer, auth, task and habit routes, workspace page shell, and task/habit manager UI behavior.

The app has the first login/session shell, protected task APIs, task management UI, protected habit APIs, daily habit UI, AI-backed care refresh with fallback, an AI connectivity test, AI chat with per-user SQLite history, selectable AI proposal cards, confirmed AI writes, and action logs.

## Documentation Maintenance

Every development change should keep documentation current:

- Update `Readme.md` when setup, scripts, environment variables, deployment, or user-facing scope changes.
- Update `architecture.md` when directories, file placement rules, module boundaries, or dependency rules change.
- Update local `AGENT.md` when important product or implementation decisions are confirmed. It is intentionally ignored by Git.
