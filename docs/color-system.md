# Color System

This document is the source of truth for PhD Workspace color usage. Keep it updated whenever a feature adds, removes, or changes visual states, theme tokens, or component color behavior.

## Purpose

The app supports multiple themes (`Light`, `Dark`, `Forest`, `Warm`, and `System`). Components must stay visually coherent in every theme, so they should use semantic color tokens rather than raw color names.

The core rule: components describe intent, themes choose color.

Examples:

- Use `bg-care-soft`, not `bg-amber-50`, for the mental-care quote panel.
- Use `text-delete`, not `text-red-600`, for delete icons.
- Use `bg-priority-medium`, not `bg-yellow-400`, for medium priority dots.
- Use `bg-task-parent` / `bg-task-child` for task row backgrounds; priority belongs in compact dots and optional subtask hierarchy lines.
- Use `bg-due-near-soft`, not `bg-warning-soft`, for near-due task rows.
- Use `bg-sync-idle-soft`, not `bg-success-soft`, for the normal synced state.

## Theme Strategy

### Light

Default work mode. It should feel calm, clean, and low distraction. Large surfaces must remain near-neutral with low chroma. Warm colors are allowed for small state indicators, not broad panels.

### Dark

Low-light work mode. It should avoid pure black and pure white. State colors should be visible but not neon.

### Forest

Quiet focus mode. It uses green-leaning neutrals and natural state colors. Avoid turning every state into the same green family; warning, danger, info, and priority still need separation.

### Warm

Low-pressure reading and planning mode. It can use warmer neutrals, but semantic states still need clear distinction. Warm mode is not a license to make every panel orange.

### System

Follows the browser or OS dark-mode preference, resolving to `Light` or `Dark` at runtime.

## Token Layers

### Base Surface Tokens

These define the base application shell and ordinary controls.

| Token | Use |
| --- | --- |
| `bg` / `paper` | Page background. |
| `surface` | Cards, panels, ordinary form controls. |
| `surface-muted` | Table headers, subtle grouped rows, inactive backgrounds. |
| `text` / `primary` / `ink` | Main readable text. |
| `text-muted` / `muted` | Secondary labels, helper text, timestamps. |
| `border` / `line` | Ordinary borders and dividers. |
| `accent` / `moss` | Primary actions, focus, selected states, brand signal. |
| `accent-soft` | Low-emphasis accent backgrounds. |

### State Tokens

These define small and medium-sized system states. They can be used for badges, icons, text, borders, and compact controls.

| Token | Use |
| --- | --- |
| `success`, `success-soft`, `success-text` | Completed, available, confirmed, and explicit success events. Do not use for the ordinary synced idle state. |
| `warning`, `warning-soft`, `warning-text` | Saving, waiting, caution, temporary attention. |
| `danger`, `danger-soft`, `danger-text` | Errors, failed sync, blocked state, destructive consequences. |
| `info`, `info-soft`, `info-text` | Informational status and non-urgent active state. |
| `sync-idle`, `sync-idle-soft`, `sync-idle-text` | Normal synced state. This is a calm neutral state, not a success celebration. |
| `sync-active`, `sync-active-soft`, `sync-active-text` | Temporary syncing / saving state. Keep it visible but low-drama. |

State `*-soft` tokens are not automatically safe for large panels. Before using them for a broad area, check whether a more specific large-area token exists.

### Large-Area Tokens

These exist because large areas need lower chroma than compact badges and icons.

| Token | Use |
| --- | --- |
| `care`, `care-soft`, `care-text` | Mental-care quote panel and quote controls. Use instead of `energy` or `warning`. |
| `proposal`, `proposal-soft`, `proposal-text` | AI proposal card container. Use instead of `warning`. |
| `row-warning-soft` | Broad row background for near-due tasks. Use through `due-near-soft`. |
| `row-danger-soft` | Broad row background for overdue tasks. Use through `due-over-soft`. |
| `task-parent` | Ordinary first-level task row background. |
| `task-child` | Ordinary subtask row background. Slightly quieter than parent rows. |
| `task-row-hover` | Shared task row hover background. Keep it transparent or extremely subtle when row priority backgrounds are active. |
| `task-priority-low`, `task-priority-medium`, `task-priority-high` | Reserved task priority row tokens. Current task UI keeps row backgrounds neutral and uses priority dots instead. |
| `task-priority-low-selected`, `task-priority-medium-selected`, `task-priority-high-selected` | Reserved parent task selected backgrounds. Current task UI uses ring-only selection feedback instead. |
| `task-priority-low-child`, `task-priority-medium-child`, `task-priority-high-child` | Reserved subtask row tokens. Current task UI keeps child rows neutral and uses a subtle left hierarchy line. |
| `task-priority-low-child-selected`, `task-priority-medium-child-selected`, `task-priority-high-child-selected` | Reserved subtask selected backgrounds. Current task UI uses ring-only selection feedback instead. |

Large-area token rule: if a color fills a card, table row, message panel, or proposal block, prefer one of these tokens or create a new low-chroma token. Do not use vivid state colors as broad backgrounds.

### Feature Tokens

These map domain concepts to colors.

| Token | Use |
| --- | --- |
| `energy`, `energy-soft`, `energy-text`, `energy-muted` | Mental-care energy icons and compact energy state feedback. Do not use `energy-soft` as the quote panel background. |
| `action-muted`, `action-muted-hover` | Low-emphasis utility icons and secondary action affordances. |
| `delete`, `delete-soft`, `delete-hover` | Destructive hover and confirmed danger states. Trash icons should usually start as `action-muted` and switch to delete colors on hover. |
| `priority-low`, `priority-medium`, `priority-high` | Task priority dots only. Keep them compact and clearly distinguishable. Do not use these as task row backgrounds. |
| `due-near`, `due-near-soft` | Near-due task indicators. `due-near-soft` is intentionally subtle for row backgrounds. |
| `due-over`, `due-over-soft` | Overdue task indicators. Stronger than near-due, still controlled for row fills. |

### Task Status Tokens

Task status chips must use these token triplets.

| Status | Tokens |
| --- | --- |
| `Todo` | `status-todo`, `status-todo-soft`, `status-todo-text` |
| `Next` | `status-next`, `status-next-soft`, `status-next-text` |
| `Doing` | `status-doing`, `status-doing-soft`, `status-doing-text` |
| `Waiting` | `status-waiting`, `status-waiting-soft`, `status-waiting-text` |
| `Blocked` | `status-blocked`, `status-blocked-soft`, `status-blocked-text` |
| `Paused` | `status-paused`, `status-paused-soft`, `status-paused-text` |
| `Done` | `status-done`, `status-done-soft`, `status-done-text` |

Do not reuse status colors for unrelated component backgrounds. For example, `Waiting` can use warning tokens, but the AI proposal card should use `proposal` tokens.

## Component Rules

### Workspace Shell

- Page background uses `bg-paper`.
- Cards and panels use `bg-white` or `bg-surface`; compatibility CSS maps existing `bg-white` to `surface` under active themes.
- Header date and account chips use neutral surface tokens.
- `Synced` uses `sync-idle` tokens. `Saving` uses `sync-active` tokens, and `Failed` uses danger tokens.
- Theme selector stays neutral, not semantic-state colored.

### Mental Care

- Quote panel uses `care`, `care-soft`, and `care-text`.
- Energy icons use `energy` and `energy-muted`.
- Level 5 badge uses CSS variables, not hardcoded amber fills.
- Quote settings controls use `care-text` and `hover:bg-care/10`.
- Errors use `danger` tokens.

### Habits

- Progress bar uses `success`.
- Completed and partial check-in circles use `success` tokens.
- Pending check-in uses `success-soft` with subtle ring feedback.
- Deactivate trash icon uses `action-muted` by default and `delete` only on hover, not raw red.
- Completed rows remain neutral muted, not success colored.

### Tasks

- Status chips use `status-*` token triplets.
- Priority dots use `priority-*` tokens. Low/Medium/High dots remain compact green/yellow/red field markers, with subdued saturation.
- Completion controls use `success` tokens.
- Parent task rows use neutral `task-parent`; subtask rows use neutral `task-child`.
- Subtask rows can show a subtle left border using the parent priority dot color to preserve group context without coloring the whole row.
- Selected task rows keep their ordinary priority background and use an inset ring as the selection cue. Hover must not replace these priority backgrounds with a generic gray.
- Delete trash icons use `action-muted` by default, then `delete` and `delete-soft` on hover.
- Near-due and overdue states should use bold `due-near` / `due-over` date text on compact Due controls, not whole-row backgrounds and not colored Due-control backgrounds when task priority row colors are active.

### AI Assistant

- Connection state uses `success`, `danger`, or neutral tokens.
- Assistant error messages use `danger-text`.
- Proposal cards use `proposal`, `proposal-soft`, and `proposal-text`.
- Apply buttons use `accent`; reject/cancel buttons stay neutral unless the action is destructive.
- Message bubbles use surface/accent tokens, not feature-specific colors.

### Admin Dashboard

- Errors use `danger` tokens.
- Unused invite codes use `success-soft` and `success-text`.
- Used invite codes stay neutral.
- Copied icons use `success`.
- Admin overview stat cards remain neutral; do not color each stat by default.

### Login And Registration

- Primary submit and active auth mode use `accent`.
- Form errors use `danger-text`.
- Inputs use surface, text, border, and focus accent tokens.

## Implementation Locations

| File | Responsibility |
| --- | --- |
| `docs/color-system.md` | Human-readable source of truth and maintenance rules. |
| `app/globals.css` | CSS variable definitions for all themes and compatibility overrides. |
| `tailwind.config.ts` | Tailwind semantic color names mapped to CSS variables. |
| `components/theme/ThemeProvider.tsx` | Theme preference, selector UI, and local persistence. |
| `app/layout.tsx` | Early theme initialization script to reduce flash before React hydration. |

## Adding Or Changing Colors

Use this checklist for any new feature or UI state:

1. Decide whether the color is base surface, state, large-area, or feature-specific.
2. Reuse an existing semantic token if the intent matches.
3. If no token matches, add a new semantic token to this document first.
4. Add CSS variables for every theme in `app/globals.css`.
5. Add Tailwind mappings in `tailwind.config.ts`.
6. Use semantic classes in components. Avoid raw color utility names such as `bg-amber-50`, `text-red-600`, or `bg-green-500` in new code.
7. Check Light, Dark, Forest, and Warm manually or with screenshots when the change affects visible UI.
8. Update this document's change log.

## Anti-Patterns

- Do not use `warning-soft` or `danger-soft` as broad card/panel backgrounds unless the entire panel is truly a warning or error.
- Do not make Light mode look warm by default. Light should remain calm and mostly neutral.
- Do not use vivid warm colors for generic sync activity. `Saving` should stay subdued and informational, not attention-seeking.
- Do not let Warm mode collapse all semantic states into orange or brown.
- Do not hardcode icon fills such as `#f59e0b`; use CSS variables for theme-aware icons.
- Do not use priority colors outside priority dots.
- Do not use priority dot colors as task row backgrounds. Task rows should stay neutral unless a future design explicitly reintroduces low-chroma row priority fills.
- Do not use task status colors outside task status chips unless explicitly documented here.
- Do not add a new theme without mapping every token in `app/globals.css`.

## Current Theme Token Inventory

The current implementation exposes these semantic Tailwind colors:

```text
ink, paper, moss,
surface, surface-muted, primary, muted, line, accent, accent-soft,
success, success-soft, success-text,
warning, warning-soft, warning-text,
danger, danger-soft, danger-text,
info, info-soft, info-text,
energy, energy-soft, energy-text, energy-muted,
care, care-soft, care-text,
proposal, proposal-soft, proposal-text,
row-warning-soft, row-danger-soft,
sync-idle, sync-idle-soft, sync-idle-text,
sync-active, sync-active-soft, sync-active-text,
task-parent, task-child, task-row-hover,
task-priority-low, task-priority-medium, task-priority-high,
task-priority-low-selected, task-priority-medium-selected, task-priority-high-selected,
task-priority-low-child, task-priority-medium-child, task-priority-high-child,
task-priority-low-child-selected, task-priority-medium-child-selected, task-priority-high-child-selected,
action-muted, action-muted-hover,
delete, delete-soft, delete-hover,
priority-low, priority-medium, priority-high,
status-todo, status-todo-soft, status-todo-text,
status-next, status-next-soft, status-next-text,
status-doing, status-doing-soft, status-doing-text,
status-waiting, status-waiting-soft, status-waiting-text,
status-blocked, status-blocked-soft, status-blocked-text,
status-paused, status-paused-soft, status-paused-text,
status-done, status-done-soft, status-done-text,
due-near, due-near-soft, due-over, due-over-soft
```

Legacy `coral` and `amber` still exist in `tailwind.config.ts`, but new code should not use them unless a future design decision assigns them a specific semantic purpose.

## Change Log

- 2026-05-19: Created the color system document after theme work exposed weak color governance. Documented semantic token layers, large-area color rules, and component-specific color usage.
- 2026-05-19: Refined Light mode semantics for low-distraction task work. Added neutral sync idle tokens, parent/subtask row tokens, shared task hover, and muted action tokens for trash buttons.
- 2026-05-19: Split task priority dot colors from task row importance backgrounds. Added task-priority row tokens, made Light mode row importance use green-tinted large-area steps, and documented that hover must not override semantic row backgrounds.
- 2026-05-19: Moved near-due and overdue emphasis out of whole task rows and into compact Due controls so row background remains tied to task priority.
- 2026-05-19: Simplified task table color hierarchy. Task rows returned to neutral parent/child backgrounds; priority is shown through subdued dots and optional child hierarchy lines; Due uses bold yellow/red text only.
