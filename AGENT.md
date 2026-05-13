# AGENT.md

This file stores maintainer context for future development sessions.

## Project

- Product name: 博士工作台 / PhD Workspace
- Stage: MVP planning and initial scaffolding
- Primary user: one personal PhD student user
- Deployment: personal server with a public web port
- For normal server access, prefer `./scripts/start.sh` production mode. `./scripts/start-dev.sh` is only for active development because `next dev` adds on-demand route compilation and React development-mode duplicate effects.
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
- Normal non-AI writes should feel immediate but not abrupt. Use optimistic UI for high-frequency row edits, habit target changes, deletions, and care status updates. Completion/check-in actions must update local state and header progress immediately, then show a short pending highlight while the background sync finishes. Row movement, hiding, or final settling can be briefly delayed, but counts and status should not wait for the network. Show a compact global sync badge near the page date.
- Use `YYYY-MM-DD` for date-only fields.
- AI may read all current and historical task records in `tasks.json` without extra confirmation, including completed tasks and subtasks. It may also read active habits with today's progress and today's care summary.
- AI may propose create/update/delete/check-in operations for tasks and habits, but every write must be explicitly confirmed by the user before data is written.
- AI write proposals use a selectable confirmation card in the assistant panel. Users can confirm a checked subset or reject the suggestions. The chat route must never write data; the confirm route is the only AI write path.
- When AI proposes a new parent task and subtasks in the same batch, subtasks should use `parentProposalId`; the confirmation route also falls back to the most recently created top-level task in that batch so task splitting does not partially fail.
- Parent task completion and child task completion are independent.
- Completing a parent task does not complete subtasks.
- Completing all subtasks does not complete the parent task.
- Deletions are recoverable in data design: deleted records move into `trash.json`.
- MVP does not need a restore UI yet.
- If AI care-message generation fails, show a local fallback gentle message and allow retry.
- API keys must stay server-side and must never be exposed to frontend code.

## MVP Modules

- Mental care: one gentle daily quote, refresh, favorite toggle, 1-5 energy self-assessment, and one editable "today focus" item. When AI is configured, refresh should generate the quote through the server-side OpenAI-compatible API; when AI is unavailable or fails, use a local fallback message and keep the page stable.
- Mental care UI should stay compact and should not use a large check-in button inside the module. If a check-in/sign-in concept returns later, place it at the whole panel level rather than inside the quote area.
- Mental care energy feedback uses five compact icons beside the card title, without an `Energy` text label. Initial state is five hollow hearts, level 1 shows a broken heart, levels 2-4 show selected hearts, and level 5 shows five bright amber badge icons.
- Mental care layout should put energy icons and a compact one-word status pill in the title row, then the highlighted Daily quote block, then the Today focus input. Do not place Energy and Daily quote side by side.
- Mental care title-row energy icons and the status pill should use stable fixed widths so changing the energy label does not shift the icon positions.
- Mental care energy status labels should be single words: `Unset`, `Low`, `Soft`, `Steady`, `Ready`, `Bright`.
- Level 5 energy should use a custom solid amber/orange badge SVG at the same 18px size as the heart icons, with enough filled area to feel more prominent than the hearts. Energy buttons should remain clickable during save so the user can change the level again; the latest click wins.
- Mental care quote actions should be small icon-only controls: refresh uses `Retry care message`, favorite uses hollow/filled star and toggles on repeated click.
- Mental care "today focus" should look like an editable text field with a grey placeholder and save on blur or Enter. Do not disable this input during unrelated energy/favorite saves, because the disabled-state repaint looks like a visual flash.
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
- AI configuration is server-only through `AI_API_KEY`, `AI_MODEL`, and `AI_BASE_URL`. Real values belong in `.env.local` or server environment variables and must not be committed.
- The AI assistant panel should expose a compact `Test AI` control and a compact chat area. Chat can help plan, break down work, and produce selectable operation proposals. Confirmed proposals may create/update/delete tasks, create/update/deactivate habits, and increment/decrement today's habit check-ins.
- AI proposal card action buttons should use short labels, currently `Apply` and `Cancel`, to avoid wrapping in the narrow right-side panel.
- On desktop, the AI assistant panel should stay sticky within the viewport. Its message history scrolls independently, and the text input remains at the bottom of the assistant panel.
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
