# 博士工作台 / PhD Workspace

博士工作台是一个轻量级个人博士工作台，用于管理科研任务、每日健康习惯、心灵关怀打卡，并通过页面内 AI 助手辅助梳理和维护任务体系。

当前项目处于 MVP 规划和初始搭建阶段。

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

## Environment Variables

Planned variables:

```bash
APP_PASSWORD=change-me
DATA_DIR=/absolute/path/to/phd-workspace-data
AI_API_KEY=your-model-api-key
AI_MODEL=your-model-name
```

Rules:

- `APP_PASSWORD` is the single access password.
- `DATA_DIR` points to runtime JSON data outside the repository.
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

Example data shapes may be stored in `data.example/` after project scaffolding.

## Git And GitHub Sync

This project should use Git for source code and documentation. Normal development should be synced to a personal GitHub repository.

Recommended GitHub repository settings:

- Repository name: `phd-workspace` or `phd-ddl`.
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

No application code has been scaffolded yet. The current project contains project-maintenance documentation:

- `AGENT.md`: maintainer context and confirmed decisions.
- `architecture.md`: planned directory layout and file placement rules.
- `Readme.md`: project overview, MVP scope, and setup expectations.
- `.gitignore`: Git ignore rules for dependencies, secrets, build output, logs, and runtime data.
- `.env.example`: example environment variable names without real secrets.

## Documentation Maintenance

Every development change should keep documentation current:

- Update `Readme.md` when setup, scripts, environment variables, deployment, or user-facing scope changes.
- Update `architecture.md` when directories, file placement rules, module boundaries, or dependency rules change.
- Update `AGENT.md` when important product or implementation decisions are confirmed.
