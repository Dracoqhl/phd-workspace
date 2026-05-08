# AGENT.md

This file stores maintainer context for future development sessions.

## Project

- Product name: 博士工作台 / PhD Workspace
- Stage: MVP planning and initial scaffolding
- Primary user: one personal PhD student user
- Deployment: personal server with a public web port
- Storage: server-local JSON files, separated from code and not synced through Git
- UI shape: one main workspace page plus a persistent right-side AI assistant panel

## Confirmed Product Decisions

- Single-user product. Do not build registration, multi-account login, roles, or collaboration for MVP.
- Use Git to sync source code and project documentation.
- Sync code to a personal GitHub repository during normal development.
- After each completed and verified development version, commit the version and push it to GitHub.
- Do not sync runtime JSON data, API keys, password config, logs, or build artifacts through Git.
- Use one access password instead of an account system.
- Store the access password on the server, preferably through `APP_PASSWORD`.
- Store data in multiple local JSON files, configured by `DATA_DIR`.
- Use server timezone for all "today" behavior and daily check-ins.
- Daily habit check-ins refresh at 02:00 server time; 00:00-01:59 belongs to the previous habit business date.
- Use `YYYY-MM-DD` for date-only fields.
- AI may propose operations for all app content, but every create/update/delete/check-in operation must be explicitly confirmed by the user before data is written.
- Parent task completion and child task completion are independent.
- Completing a parent task does not complete subtasks.
- Completing all subtasks does not complete the parent task.
- Deletions are recoverable in data design: deleted records move into `trash.json`.
- MVP does not need a restore UI yet.
- If AI care-message generation fails, show a local fallback gentle message and allow retry.
- API keys must stay server-side and must never be exposed to frontend code.

## MVP Modules

- Mental care: one AI-generated gentle care message per day, refresh, daily check-in, optional mood note.
- Habits: create/edit/deactivate habits, daily complete/uncomplete check-ins.
- Completed habit rows should be greyed out, struck through, and sorted after incomplete habits. Cancelling a check-in should restore the habit near the front of the active list.
- Tasks: parent tasks plus one level of subtasks, status, priority, due date, filters, completed visibility.
- AI assistant: persistent right panel, chat, API test, structured operation proposals, user confirmation cards, operation logs.
- Local persistence: JSON files with safe write behavior.

## Preferred Technical Direction

- Default stack: Next.js full-stack app with React and route handlers.
- Styling: Tailwind CSS unless a later decision replaces it.
- Backend responsibilities live in server-only modules and route handlers.
- Frontend components must not read or write data files directly.
- AI calls must go through server-side adapters.

## Maintenance Rules

- Keep `Readme.md` current when setup, scripts, environment variables, deployment, or user-facing scope changes.
- Keep `architecture.md` current when directories, file placement rules, module boundaries, or dependency rules change.
- Keep product decisions in this file current when a later conversation settles an important implementation or scope choice.
- Keep `.gitignore` aligned with runtime data and generated files.
- Push completed, verified versions to GitHub before considering the version closed.
- Prefer small, well-bounded modules over large mixed-responsibility files.
- Do not introduce multi-user, database, notification, document/PDF, or complex agent features unless explicitly requested later.
