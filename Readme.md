# 博士工作台 / PhD Workspace

博士工作台是一个轻量级个人博士工作台，用于管理科研任务、每日健康习惯、心灵关怀打卡，并通过页面内 AI 助手辅助梳理和维护任务体系。

当前项目处于 MVP 增量开发阶段，已包含 versioned data foundation、auth routes、login shell、protected task API、任务管理 UI MVP、每日健康习惯 MVP、AI 心灵关怀生成、AI API 测试入口和右侧 AI 基础聊天。
普通非 AI 操作使用页面级同步状态提示：页面日期旁显示 `Synced`、`Saving...` 或 `Sync failed`。高频编辑会先更新界面，再在后台同步到本地 JSON API；任务完成和习惯打卡会先显示短暂 pending 高亮，再进入最终完成/置底/隐藏状态。

## MVP Scope

P0 功能：

- 单页面工作台。
- 心灵关怀模块：每日 AI 生成内容、刷新、打卡、失败 fallback。
- 每日健康习惯模块：创建、编辑、停用、完成/未完成打卡。
- 任务模块：一级任务、一层子任务、状态、优先级、截止日期、完成隐藏、接近截止/逾期高亮。
- 右侧常驻 AI 助手：聊天、API 测试、任务拆解、操作建议、确认后写入。
- 单一访问口令，不做账号系统。
- 服务器本地多 JSON 文件存储。

暂不做：

- 多用户注册、团队协作、权限系统。
- 数据库。
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
- Server-local JSON files
- Server-side AI model API integration

最终技术栈以后续实际初始化项目为准。若技术栈变化，需要同步更新本文件和 `architecture.md`。

## Local Setup

Install dependencies:

```bash
pnpm install
```

Create local environment configuration:

```bash
cp .env.example .env.local
```

Required variables:

```bash
APP_PASSWORD=change-me
SESSION_SECRET=replace-with-a-long-random-secret
DATA_DIR=/absolute/path/to/phd-workspace-data
AI_API_KEY=your-model-api-key
AI_MODEL=your-model-name
AI_BASE_URL=https://api.openai.com/v1
```

- `APP_PASSWORD` is the single access password entered on the login screen.
- `SESSION_SECRET` signs the 30-day HTTP-only session cookie. Use a long random value.
- `DATA_DIR` points to runtime JSON data outside the repository.
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

Open `http://localhost:3000`, enter `APP_PASSWORD`, and the app sets a 30-day HTTP-only session cookie. The login form supports both the normal React login flow and native HTML form POST fallback for mobile browsers.

## Environment Variables

Example variables:

```bash
APP_PASSWORD=change-me
SESSION_SECRET=replace-with-a-long-random-secret
DATA_DIR=/absolute/path/to/phd-workspace-data
AI_API_KEY=your-model-api-key
AI_MODEL=your-model-name
AI_BASE_URL=https://api.openai.com/v1
```

Rules:

- `APP_PASSWORD` is the single access password.
- `SESSION_SECRET` signs session cookies and must be a long random value.
- `DATA_DIR` points to runtime JSON data outside the repository.
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

Runtime data should live outside this repo:

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

The same empty example shapes are stored in `data.example/`.

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
- example data shapes under `data.example/`

Git must not include:

- real runtime JSON data
- `.env` secret files
- API keys
- access passwords
- logs
- build output

Recommended first-time setup after creating the GitHub repository:

```bash
git init
git add AGENT.md Readme.md architecture.md .gitignore .env.example
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

The project is in MVP implementation. Current dev status includes a versioned data foundation, auth routes, a login shell, protected task APIs, task management UI, daily habit management UI, an AI-backed mental care refresh with fallback, AI API testing, and a read-only AI chat slice. Stage A added the first tested server-side modules, Stage B added the first runnable Next.js app shell, the task slice connects the shell to local JSON task data, Stage C adds daily health habits, Stage D starts mental care, Stage E adds AI configuration testing, Stage F starts real AI care generation, and Stage G adds basic AI chat:

- `AGENT.md`: maintainer context and confirmed decisions.
- `architecture.md`: planned directory layout and file placement rules.
- `Readme.md`: project overview, MVP scope, and setup expectations.
- `.gitignore`: Git ignore rules for dependencies, secrets, build output, logs, and runtime data.
- `.env.example`: example environment variable names without real secrets.
- `data.example/`: versioned empty collection JSON examples for all runtime data files.
- `.eslintrc.cjs`: ESLint configuration for the current TypeScript-only scaffolding stage.
- `app/layout.tsx`: root App Router layout and metadata.
- `app/page.tsx`: single-page workspace shell with care, habit, task, AI assistant regions, and the current habit business date in the page header.
- `components/sync/SyncStatusProvider.tsx`: client-side sync status provider and badge for optimistic UI feedback.
- `components/care/CarePanel.tsx`: compact mental care panel connected to `/api/care/today`, `/api/care/generate`, and `/api/care/update`, with AI-backed daily quote refresh, local fallback content, stable title-row energy icons and status pill, bright level-5 sparkle feedback, small retry/favorite icon actions, and an editable "today focus" field.
- `components/assistant/AiAssistantPanel.tsx`: right-side assistant shell with a compact `Test AI` control connected to `/api/ai/test` and a compact chat area connected to `/api/ai/chat`. On desktop the panel is sticky, message history scrolls independently, and the input stays at the panel bottom.
- `components/tasks/TaskManager.tsx`: compact hierarchical task table connected to `/api/tasks`, including top-level task create/delete, one-layer subtask create/delete, expandable subtasks, small row-level complete/reopen controls, two-step select-then-edit title editing with blur save, priority color-dot editing, due-date calendar editing, readable English status labels, completed top-level task hiding, and due-date highlighting.
- `components/habits/HabitManager.tsx`: compact daily habit list connected to `/api/habits`, including a panel-level edit mode, bottom-only new-habit form, row-wide name/target maintenance in edit mode, clickable progress fractions for target changes in normal mode, trash-icon deactivation, compact circular complete/cancel controls, checked-count-over-target header progress, and multi-check cancellation behavior. Completed habits are greyed out, struck through, and sorted after incomplete habits.
- `app/globals.css`: Tailwind entry point and base page styles.
- `types/task.ts`: task entity and task input types.
- `types/habit.ts`: habit, habit check-in, habit input, and API list item types.
- `types/trash.ts`: trash entry type.
- `lib/domain/tasks.ts`: task completion, subtask progress, and due-state business rules.
- `lib/domain/habits.ts`: habit business-date helper using a 02:00 server-time day boundary and habit list sorting rules.
- `lib/domain/care.ts`: care date helper plus local fallback and AI-generated care record construction.
- `lib/ai/config.ts`, `lib/ai/test-client.ts`, `lib/ai/care.ts`, and `lib/ai/chat.ts`: server-only OpenAI-compatible AI configuration, connectivity test helper, mental-care generation helper, and read-only assistant chat helper.
- `lib/data/json-store.ts`: JSON file initialization, read, update, and atomic write helper.
- `lib/data/repositories.ts`: versioned repository factory for tasks, trash, habits, habit check-ins, care records, and AI logs.
- `app/api/tasks/**/route.ts`: protected task list, create, detail, update, delete, and subtask creation endpoints.
- `app/api/habits/**/route.ts`: protected habit list, create, update, deactivate, check-in, and check-in cancellation endpoints.
- `app/api/care/**/route.ts`: protected today's care, AI-backed refresh with fallback, care update, and legacy care check-in endpoints.
- `app/api/ai/test/route.ts`: protected AI connectivity test endpoint. It returns only availability state and never returns the configured API key.
- `app/api/ai/chat/route.ts`: protected read-only AI chat endpoint. It sends a concise workspace context of current tasks, active habits with today's progress, and today's care summary to the configured model, but does not execute writes.
- `tests/`: unit tests for task and habit domain rules, JSON data layer, auth, task and habit routes, workspace page shell, and task/habit manager UI behavior.

The app has the first login/session shell, protected task APIs, task management UI, protected habit APIs, daily habit UI, AI-backed care refresh with fallback, an AI connectivity test, and basic read-only AI chat. AI proposal and confirmation workflows are still being added.

## Documentation Maintenance

Every development change should keep documentation current:

- Update `Readme.md` when setup, scripts, environment variables, deployment, or user-facing scope changes.
- Update `architecture.md` when directories, file placement rules, module boundaries, or dependency rules change.
- Update `AGENT.md` when important product or implementation decisions are confirmed.
