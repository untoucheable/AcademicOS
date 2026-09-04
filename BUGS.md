# P0

- None identified in this audit pass.

# P1

- Calendar hides AI study blocks, so Mission and Calendar do not present the same day view.
- The app still has duplicate state layers, which can cause drift if the wrong one is used.
- Save failures in the shared state flow are only logged, so a write problem can look like the app ignored the change.

# P2

- Error messages are still fairly generic in several API flows.
- State writes accept broad payloads without much validation.
- Legacy browser state code still exists even though the server snapshot is the canonical path.

# P3

- Copy and empty-state wording can be tightened after the stability pass.

# P4

- Brightspace
- Gmail
- Google Classroom
- Drive intelligence
- AI Tutor
- analytics
- browser extension
- mobile app
- voice
- OCR
- research assistant
