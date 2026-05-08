# 博士工作台 / PhD Workspace

博士工作台是一个轻量级个人博士工作台，用于管理科研任务、每日健康习惯、心灵关怀打卡，并通过页面内 AI 助手辅助梳理和维护任务体系。

当前项目处于 MVP 增量开发阶段，已包含 versioned data foundation、auth routes、login shell、protected task API 和任务管理 UI MVP。

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
- `AI_API_KEY` is the server-side model API key for later AI features.
- `AI_MODEL` is the model name for later AI features.
- `AI_BASE_URL` is the OpenAI-compatible model API base URL. It is part of the required AI configuration, but the current foundation slice does not call the model API yet.

Run the app:

```bash
pnpm dev
```

Open `http://localhost:3000`, enter `APP_PASSWORD`, and the app sets a 30-day HTTP-only session cookie.

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
- AI keys must only be used server-side.
- Real `.env` files should not be committed.

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

The project is in MVP implementation. Current dev status includes a versioned data foundation, auth routes, a login shell, protected task APIs, and the first task management UI. Stage A added the first tested server-side modules, Stage B added the first runnable Next.js app shell, and the current task slice connects the shell to local JSON task data:

- `AGENT.md`: maintainer context and confirmed decisions.
- `architecture.md`: planned directory layout and file placement rules.
- `Readme.md`: project overview, MVP scope, and setup expectations.
- `.gitignore`: Git ignore rules for dependencies, secrets, build output, logs, and runtime data.
- `.env.example`: example environment variable names without real secrets.
- `data.example/`: versioned empty collection JSON examples for all runtime data files.
- `.eslintrc.cjs`: ESLint configuration for the current TypeScript-only scaffolding stage.
- `app/layout.tsx`: root App Router layout and metadata.
- `app/page.tsx`: single-page workspace shell with care, habit, task, and AI assistant regions.
- `components/tasks/TaskManager.tsx`: client task manager connected to `/api/tasks`, including top-level task create/edit/delete, one-layer subtask create/edit/delete, status/priority/due-date editing, readable English status and priority labels, completed top-level task hiding, and due-date highlighting.
- `app/globals.css`: Tailwind entry point and base page styles.
- `types/task.ts`: task entity and task input types.
- `types/trash.ts`: trash entry type.
- `lib/domain/tasks.ts`: task completion, subtask progress, and due-state business rules.
- `lib/data/json-store.ts`: JSON file initialization, read, update, and atomic write helper.
- `lib/data/repositories.ts`: versioned repository factory for tasks, trash, habits, habit check-ins, care records, and AI logs.
- `app/api/tasks/**/route.ts`: protected task list, create, detail, update, delete, and subtask creation endpoints.
- `tests/`: unit tests for task domain rules, JSON data layer, auth, task routes, workspace page shell, and task manager UI behavior.

The app has the first login/session shell, protected task APIs, and task management UI. Habit APIs, care APIs, and real AI workflows are still being added.

## Documentation Maintenance

Every development change should keep documentation current:

- Update `Readme.md` when setup, scripts, environment variables, deployment, or user-facing scope changes.
- Update `architecture.md` when directories, file placement rules, module boundaries, or dependency rules change.
- Update `AGENT.md` when important product or implementation decisions are confirmed.
