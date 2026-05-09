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
- Login must work with both the React fetch flow and native HTML form submission, so mobile browsers can still set the session cookie if client-side JavaScript is delayed or unavailable.
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

- Mental care: one gentle daily quote, refresh, favorite toggle, 1-5 energy self-assessment, and one editable "today focus" item. Until real AI is wired, use a local fallback message and keep the page stable.
- Mental care UI should stay compact and should not use a large check-in button inside the module. If a check-in/sign-in concept returns later, place it at the whole panel level rather than inside the quote area.
- Mental care energy feedback uses five compact icons: initial state is five hollow hearts, level 1 shows a broken heart, levels 2-4 show selected hearts, and level 5 shows five small suns.
- Mental care should visually combine energy assessment and daily quote into one cohesive upper panel rather than two separate stacked boxes. Energy icons should be large enough to read comfortably, and level 5 suns must render as active amber icons rather than grey inactive icons.
- Mental care quote actions should be small icon-only controls: refresh uses `Retry care message`, favorite uses hollow/filled star and toggles on repeated click.
- Mental care "today focus" should look like an editable text field with a grey placeholder and save on blur or Enter.
- Habits: create/edit/deactivate habits, daily complete/uncomplete check-ins.
- Habit UI should stay compact and avoid decorative icon columns unless the user explicitly asks for them.
- Habit creation UI should show habit name and daily target only. Keep `description` in data for future details UI, but do not show it in the current compact list.
- Habit normal mode should prioritize the habit list and keep creation controls hidden. Use a small panel-level `Edit` button to enter a whole-panel maintenance mode.
- Habit edit mode should make all habit rows editable at once, show deactivate controls, and place the new-habit form at the bottom of the panel.
- Habit progress fractions such as `1/3` should be clickable in normal mode to edit the daily target.
- Habit daily target is an integer from 1 to 5. Multi-check habits increment one count per click until target is reached; cancelling decrements one count.
- Habit panel progress should use total checked counts over total daily targets, not completed habit rows over total habit rows. Updating check-ins or target counts must immediately update the header progress bar.
- Habit completion controls should be very small circles: incomplete is an empty outlined circle; complete is a solid green circle with a white checkmark.
- Completed habit rows should be greyed out, struck through, and sorted after incomplete habits. Cancelling a check-in should restore the habit near the front of the active list.
- Habit deactivation should use a small trash icon, matching the task module's delete affordance. Avoid power-button style icons for this action.
- Habit editing should use the panel-level edit mode. In edit mode, row name fields save on Enter or blur. Avoid per-row edit icons for routine text editing.
- The current business date should be shown near the top of the whole workspace page, not inside the habit panel.
- Tasks: parent tasks plus one level of subtasks, status, priority, due date, filters, completed visibility.
- Task rows should include a small circular complete/reopen control immediately before the task title and after the expand/collapse affordance. Completing a top-level task should rely on the existing completed-task hiding behavior.
- Task rows should use a two-step text edit interaction: first click selects/highlights the row; a second click on the text enters inline edit. Enter and input blur both save; Escape cancels.
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
- After receiving user feedback, explicitly check whether `AGENT.md`, `Readme.md`, and `architecture.md` need updates for newly confirmed preferences or behavior.
- Keep `.gitignore` aligned with runtime data and generated files.
- Push completed, verified versions to GitHub before considering the version closed.
- Prefer small, well-bounded modules over large mixed-responsibility files.
- Do not introduce multi-user, database, notification, document/PDF, or complex agent features unless explicitly requested later.
