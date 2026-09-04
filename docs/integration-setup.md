# AcademicOS Integration Setup

This project is wired for local-first storage and integration scaffolding. The app can already store sync history, audit events, mission regeneration requests, and encrypted tokens, but the real provider connections still need your account setup.

## What I need from you

For the remaining live integrations, I need the provider credentials and a few choices about how you want to authorize access:

1. Google Cloud project ID
2. Google OAuth client ID
3. Google OAuth client secret
4. Google OAuth redirect URI you want to use
5. A long random encryption secret for token storage
6. Any Microsoft app credentials later, if you want Outlook/OneDrive support next

## What should stay private

Please do not send me passwords or raw refresh tokens. We should use OAuth flows and keep the resulting tokens encrypted in the local vault.

## Current priority order

1. Google Calendar two-way sync
2. Google Classroom assignment and announcement import
3. Gmail and Google Drive read-only import
4. D2L/Brightspace adapter scaffolding
5. Microsoft support
6. Browser extension
7. Mobile app
8. Voice, camera scanning, YouTube summarization, and research tools

## The rules we are following

- Google Calendar should only edit events AcademicOS created unless the user explicitly approves a conflict.
- Manual edits always win when there is a disagreement.
- If an imported event conflicts and the system cannot resolve it confidently, we keep both versions and surface it for review.
- Classroom, Gmail, Drive, and D2L should start read-only unless a feature truly needs write access.
- Every import should be deduped, logged, and traceable back to its source.

## How tokens will be stored

The app uses encrypted token storage backed by `ACADEMIC_OS_ENCRYPTION_SECRET`. That lets us keep OAuth tokens out of plain text while still persisting them locally.

## What happens next

Once the Google credentials are in place, we can connect the first live provider and prove the end-to-end loop:

- import a Classroom assignment
- link it to a course
- create the deadline in Calendar
- regenerate Mission
- update Home and Analytics
- avoid duplicates on re-sync
