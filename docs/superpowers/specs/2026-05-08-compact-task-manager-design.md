# Compact Task Manager Redesign

## Context

The current task manager renders each task as a large editable panel. That makes the workspace hard to scan when many tasks exist. The redesigned task manager should prioritize a compact task list similar in spirit to Feishu/Lark task lists: dense rows, clear hierarchy, and inline editing only for the fields that need frequent changes.

This redesign changes the task UI only. It keeps the existing task data model and protected task API routes.

## Goals

- Present tasks as a compact hierarchical table instead of large cards.
- Show only the primary scan fields in the list: `Task`, `Status`, `Priority`, and `Due`.
- Let top-level tasks expand or collapse their one-layer subtasks manually.
- Keep completed top-level tasks hidden by default, with the existing show/hide completed control.
- Allow fast inline editing for task titles.
- Allow fast priority and due-date changes without opening a large editor.
- Keep status read-only in this iteration.

## Non-Goals

- No new task fields.
- No database or API contract changes.
- No multi-level subtasks.
- No dedicated full detail drawer in this iteration.
- No inline status editing in this iteration.

## Layout

The task module becomes a compact four-column table:

```text
|    | Task                                | Status       | Priority | Due      |
| ▾  | Paper revision 1/2                  | In Progress  | ●        | Today    |
|    |   Rewrite introduction              | Not Started  | ●        | May 10   |
|    |   Check related work citations       | Completed    | ●        | May 12   |
| ▸  | Experiment cleanup 0/3              | Paused       | ●        | calendar |
```

The first narrow column is reserved for the top-level expand/collapse control. Subtasks leave this column empty and render their title indented in the `Task` column.

Top-level rows show subtask progress beside the task title, for example `1/2`. Subtask rows do not show progress.

The `Description` field is not shown as a table column. Existing descriptions remain stored and can be edited later when a fuller detail editor is added.

## Interactions

### Expand And Collapse

- Top-level tasks have a small chevron button.
- Clicking the chevron expands or collapses that task's subtasks.
- Newly loaded top-level tasks start collapsed by default.
- Creating a subtask expands the parent so the new subtask is visible.

### Title Editing

- Clicking a task title turns that title into a single-line input.
- Pressing `Enter` trims and saves the title through `PATCH /api/tasks/:id`.
- Pressing `Escape` cancels the edit and restores the previous title.
- Empty titles are rejected client-side and show the existing task error area.
- Blur exits edit mode without saving, preserving the previous saved value.

### Priority Editing

- Priority is represented by a small colored circular swatch, not by text in the row.
- Colors:
  - `High`: red
  - `Medium`: amber
  - `Low`: green
- Clicking the swatch opens a compact select/menu for `Low`, `Medium`, and `High`.
- Selecting an option immediately saves through `PATCH /api/tasks/:id`.
- The swatch has an accessible label that includes the readable priority name.

### Due Date Editing

- If a task has `dueDate`, the `Due` column displays the date text.
- If a task has no `dueDate`, the `Due` column shows a lucide `Calendar` icon button, not an emoji.
- Clicking the date or calendar icon turns the cell into a date input.
- Selecting a date saves through `PATCH /api/tasks/:id`.
- Pressing `Escape` cancels date editing.
- Clearing a date remains supported by the API, but the MVP UI may keep the clear affordance simple.

### Status Display

- Status is read-only in this iteration.
- Raw enum values must not be shown. Display labels remain `Not Started`, `In Progress`, `Paused`, and `Completed`.

### Create And Delete

- Top-level task creation remains available, but the form should stay compact above the list.
- Subtask creation should be a compact row-level action for the parent task.
- Delete actions remain available but should be icon-sized or otherwise visually secondary.
- Parent deletion still deletes its direct subtasks through the existing API behavior.

## Error Handling

- Loading and write errors continue to use the task module's existing error area.
- Failed writes leave the previous local row state intact.
- Invalid title saves do not call the API.

## Accessibility

- Expand/collapse buttons must have labels such as `Expand subtasks for Paper revision` and `Collapse subtasks for Paper revision`.
- Priority swatches must not rely on color alone; they need `aria-label` or visible tooltip text naming the priority.
- The calendar icon button must have a label such as `Set due date for Experiment cleanup`.
- Inline title inputs must be labelled by the task being edited.

## Testing

Update task manager tests to cover:

- Loads tasks into compact rows with `Task`, `Status`, `Priority`, and `Due` columns.
- Top-level tasks start collapsed and expand to show subtasks.
- Completed top-level tasks are hidden by default and shown by the existing toggle.
- Clicking a title, changing it, and pressing `Enter` calls `PATCH /api/tasks/:id` and updates the row.
- Pressing `Escape` while editing a title cancels changes.
- Changing priority via the compact control calls `PATCH /api/tasks/:id`.
- Clicking the calendar icon or date text enters date edit mode and saving calls `PATCH /api/tasks/:id`.
- Creating a subtask expands the parent and shows the new subtask.

## Implementation Notes

- Keep using `components/tasks/TaskManager.tsx` for now, but split small row helpers inside the file if that keeps the implementation readable.
- Continue using lucide icons. Use `Calendar`, `ChevronRight`, `ChevronDown`, `Plus`, and `Trash2` where appropriate.
- Keep the existing task API route tests unchanged unless the UI exposes a missed API behavior.
- Do not introduce new dependencies.
