# Optimistic Sync Design

## Goal

Normal non-AI interactions should feel immediate. The app should update the visible row, progress, or field first, then synchronize the JSON-backed API request in the background. A compact status badge near the page date tells the user whether the current view is synced.

## Scope

This version covers the existing client-side write flows:

- Task create, update, complete/reopen, delete, and subtask create/delete.
- Habit create, update, deactivate, check-in, and check-in cancellation.
- Care energy, favorite, and today-focus updates.

AI chat and care retry generation are not fully optimistic because they depend on model-generated server output.

## Architecture

Add a client-side sync provider under the authenticated workspace. Components call `trackSync(promise)` around existing fetch requests. The provider tracks pending request count, last successful sync time, and the latest sync error. A `SyncStatusBadge` displays `Synced`, `Saving...`, or `Sync failed` beside the page date.

Each feature component performs local state changes before awaiting the request. It keeps a snapshot of the previous state for rollback. If the request fails, the component restores the snapshot and the provider shows `Sync failed`.

## Error Handling

Failed optimistic writes roll back the affected component state and keep the existing inline error message. The global badge shows the failure state until another write starts or succeeds.

## Testing

Tests should verify that UI changes appear before mocked fetch promises resolve, that failures roll back local state, and that the global badge reflects pending, success, and failed states.
