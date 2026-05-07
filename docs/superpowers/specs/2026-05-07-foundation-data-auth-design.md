# Foundation: Versioned Data + Password Access Design

## Context

PhD Workspace is a single-user Next.js MVP for personal doctoral work management. Stages A and B have already created the initial tested task/data slice and a static App Router shell.

This design defines the next foundation slice before feature CRUD work: versioned local JSON persistence and simple password access. The goal is to make all later modules share the same data shape, initialization behavior, and access boundary.

## Confirmed Decisions

- The app remains single-user for MVP.
- Real runtime data lives outside the repository in `DATA_DIR`.
- Every JSON data file uses:
  ```json
  {
    "schemaVersion": 1,
    "items": []
  }
  ```
- JSON writes use temporary-file write plus atomic replace.
- No automatic backup mechanism in MVP.
- Access protection is P0.
- `APP_PASSWORD` is the only login credential.
- Successful login sets an HTTP-only cookie session for 30 days.
- Logout clears the session cookie.
- Changing `APP_PASSWORD` does not need to invalidate existing sessions in this slice.
- AI configuration must support `AI_API_KEY`, `AI_MODEL`, and `AI_BASE_URL`.
- AI may read app data for MVP; implementation should still crop context for stability and cost.
- `Test AI` belongs in the AI assistant panel only.
- Mental-care failure UI uses `Retry`, not `Test AI`.
- Task status and priority are stored as lowercase enum values, while UI displays readable title-case labels.
- Parent and child task completion are independent.
- Deleting a parent task deletes all direct subtasks into trash after a confirmation prompt.

## Scope

This slice includes:

- `DATA_DIR` resolution and validation.
- Initialization of all MVP JSON files:
  - `tasks.json`
  - `habits.json`
  - `habit-checkins.json`
  - `care-records.json`
  - `ai-logs.json`
  - `trash.json`
- A versioned JSON collection store.
- Repository updates to use versioned collections.
- Example JSON files under `data.example/`.
- Password login, logout, and session checking.
- A login page state in the existing app shell.
- Protected access for the main page shell.
- A shared auth helper usable by future API routes.
- Tests for data initialization, versioned persistence, auth helpers, and page auth states.
- README and architecture updates.

This slice does not include:

- Full task CRUD API or UI.
- Habit CRUD API or UI.
- Care generation or AI calls.
- AI assistant chat.
- Backup files.
- Multi-user accounts or password reset.

## Data Design

All runtime JSON files use this common shape:

```ts
interface VersionedCollection<T> {
  schemaVersion: 1;
  items: T[];
}
```

The store reads and writes the full collection object. Repositories expose domain-focused methods so UI and route handlers do not manipulate raw JSON files directly.

Missing files are created lazily on first read or explicit initialization. Initialization must create the directory if it does not exist.

`trash.json` stores versioned `TrashEntry[]` items. Trash entries include:

- `id`
- `deletedType`
- `deletedAt`
- `originalId`
- `originalData`

## Auth Design

`APP_PASSWORD` is read server-side only. The login route compares the submitted password with `APP_PASSWORD`.

On success, the server sets an HTTP-only cookie with:

- path `/`
- max age 30 days
- same-site `lax`
- secure in production

The session value can be a signed token derived from a server secret. For this MVP, the secret may be derived from `APP_PASSWORD` and a stable app-specific salt so no extra environment variable is required.

The page shell checks session state server-side. If not authenticated, it renders a login form. If authenticated, it renders the workspace shell.

Future protected API routes should call the same auth helper before reading or writing data.

## UI Behavior

The login screen is minimal:

- password input
- submit button
- friendly error for invalid password
- no registration or account recovery text

The authenticated shell keeps the Stage B layout:

- main panel
- care section
- habit section
- task section
- right AI assistant panel

The shell can show static placeholders until feature CRUD is implemented.

## Error Handling

Data layer:

- Missing `DATA_DIR` should produce a clear server-side configuration error when a route/repository needs data.
- Missing JSON files are initialized automatically.
- Invalid JSON should throw a clear error and not overwrite the file silently.

Auth:

- Missing `APP_PASSWORD` should make login unavailable and return a clear configuration error.
- Wrong password returns a generic invalid-password response.
- Session check returns authenticated or unauthenticated without exposing secret details.

## Testing

Data tests:

- Empty `DATA_DIR` initializes all expected JSON files.
- New files use `schemaVersion: 1` and `items: []`.
- `JsonStore` reads and updates versioned collections.
- Deleting a task writes a versioned trash entry.

Auth tests:

- Correct password creates a valid session token.
- Wrong password is rejected.
- Valid session token is accepted.
- Missing or invalid session token is rejected.

Page tests:

- Unauthenticated render shows the login form.
- Authenticated render shows the workspace regions.

Verification commands:

- `pnpm lint`
- `pnpm test`
- `pnpm exec tsc --noEmit`
- `pnpm build`

## Open Questions Resolved Later

- Whether completed task restore needs a dedicated UI.
- Whether AI should execute update/delete proposals.
- Whether JSON backup should be automatic, manual, or omitted.
- Whether app labels should later be localized while keeping API enums stable.
