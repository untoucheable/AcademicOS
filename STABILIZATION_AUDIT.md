# AcademicOS Stabilization Audit

## Architecture map

- `AppShell` renders the app chrome and navigation.
- `AppProvider` is the client-side data hub for pages.
- `/api/state` is the current read/write bridge between the client and the persisted student state.
- `src/lib/database.ts` stores the canonical server snapshot in `.academic-os/database.json`.
- `src/lib/server-state.ts` and `src/lib/state-repository.ts` wrap that database for API routes.
- `Mission`, `Calendar`, `Assignments`, `Courses`, `Documents`, `Grades`, and `Integrations` pages all read from the shared app state.
- Google Calendar sync flows through `src/lib/google/*` and the Google OAuth / sync API routes.

## Current working features

- Shared student data is persisted through the server snapshot.
- Assignments can be created, edited, completed, and deleted.
- Courses are derived from assignments, grades, documents, and study sessions.
- Calendar renders month and upcoming views from shared state.
- Mission generation exists and reads the same state as the rest of the app.
- Google Calendar connect / sync / disconnect routes exist.
- Loading states and empty states exist in the main workflows.

## Broken or incomplete features

1. Calendar does not surface AI study blocks because the page filters them out.
2. The app still carries duplicate state systems, especially `student-store.ts`, which is a separate browser-local store from the canonical server snapshot.
3. Persistence failures in `AppProvider` are only logged to the console, so a save problem can look like the app ignored the change.
4. The state API accepts broad payloads with minimal validation, so bad data can spread quickly.
5. Google Calendar is the only integration that is actually wired end-to-end in this copy, while the roadmap and core types still reference additional future providers.

## Duplicate systems and conflicting state stores

- `src/lib/student-store.ts` stores state in browser `localStorage`.
- `src/lib/server-state.ts` reads and writes the canonical server snapshot.
- `src/lib/database.ts` owns the actual persisted file.
- `AppProvider` currently uses the server snapshot, but the browser store still exists and can confuse maintenance.

## Type and data-shape risks

- `StudentState` is large and shared by many workflows, so any shape mismatch can affect many pages at once.
- `CalendarEvent` is used both for fixed calendar items and AI schedule items, which makes source handling easy to blur.
- `IntegrationConnection` and related sync history structures are derived in several places and should stay aligned with the persisted state.

## Persistence risks

- Any save failure in `AppProvider` can leave the UI looking updated while the server copy is stale.
- The mission page rebuilds on state changes, so a stale or failed state write can cause confusing mission output.
- Browser-only state in `student-store.ts` should not be allowed to re-enter the product path.

## Server/client state risks

- The client fetches `/api/state`, then immediately rehydrates pages from that response.
- Server routes also mutate the state directly, which means the client and server need to stay in lockstep.
- Google sync updates state server-side and then relies on a refresh path to bring the client up to date.

## API error-handling gaps

- Several routes return generic error messages rather than context-rich failures.
- Persistence errors from the client are not surfaced to the user in a visible way.
- OAuth and sync routes need clearer failure states for token, redirect, and import problems.

## Scheduling edge cases

- Fixed events and generated mission blocks share the same underlying calendar shape.
- The calendar page must show fixed events plus AI study blocks without hiding the study blocks from the user.
- Mission planning needs to keep explicit user updates, fixed events, and flexible filler blocks distinct enough to place work correctly.

## Integration configuration risks

- Google Calendar has environment validation, but the app still references future integration families in the roadmap and type system.
- Missing or invalid OAuth environment variables can fail at runtime if they are not caught early enough.

## Dead or legacy code

- `src/lib/student-store.ts` is legacy browser state and should be treated as removable once the canonical server path is fully trusted.
- Any duplicate sync or mission helpers that no longer feed the shared state should be retired.

## Security concerns

- `/api/state` accepts a broad payload and trusts the client to send a valid student state.
- Google OAuth and token flows should never leak secrets into client code or logs.
- External-event deletion rules need to stay strict so imported items are not edited accidentally.

## Build and deployment risks

- The app should keep `npm run lint` and `npm run build` green before each workflow change.
- The biggest product risk is not the build itself; it is data drift between overlapping state systems.

## Single source-of-truth recommendation

Use `src/lib/database.ts` plus `src/lib/server-state.ts` and `/api/state` as the only canonical state layer.

Keep `AppProvider` as a client cache and persistence client.

Retire `src/lib/student-store.ts` from the active workflow so browser-local state cannot diverge from the server snapshot.

## Priority list

### P0

- None identified from this pass.

### P1

- Calendar hides AI study blocks instead of showing them alongside fixed events.
- Duplicate state systems can cause drift if the wrong store is used.
- Persistence failures can silently leave the app looking updated while the canonical state is stale.

### P2

- Error handling is too generic in several flows.
- State validation is broad and could admit malformed payloads.
- Legacy store code still exists and adds maintenance risk.

### P3

- Copy and empty-state wording can be tightened after the core stability pass.

### P4

- Brightspace, Gmail, Classroom, Drive intelligence, AI Tutor, analytics, browser extension, mobile app, voice, OCR, and research assistant.

## Test checklist

1. Mission: enter a natural-language update, generate a schedule, refresh the page, and confirm the mission still reflects the saved state.
2. Assignments: create, edit, complete, refresh, and delete an assignment.
3. Calendar: confirm fixed events show up, confirm AI study blocks show up, and confirm there are no duplicates or overlaps.
4. Courses: confirm assignments and grades group by course and course metrics update after changes.
5. Google Calendar: connect, import, sync, refresh, and disconnect.
6. Reliability: trigger loading, empty, and error states and confirm no blank screens appear.

## Proposed implementation order

1. Shared persistent state
2. Assignments
3. Calendar
4. Mission generation
5. Mission persistence
6. Google Calendar
7. Courses
8. Error, loading, and empty states
9. Production deployment
