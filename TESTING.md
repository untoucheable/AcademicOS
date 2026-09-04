# AcademicOS Manual Test Checklist

## Mission

1. Enter a natural-language update.
2. Confirm Mission generates a schedule.
3. Refresh the page.
4. Confirm the current Mission still reflects the saved state.
5. Confirm fixed events remain fixed.
6. Confirm the schedule has no overlaps or duplicates.

Expected result:
- Mission remains visible after refresh.
- Fixed events do not move.
- The schedule stays coherent after a rebuild.

## Assignments

1. Create a new assignment.
2. Refresh the page.
3. Confirm the assignment is still there.
4. Edit the assignment.
5. Change the due date and priority.
6. Mark it complete.
7. Delete it.

Expected result:
- Assignment changes persist.
- Mission uses the current assignment list.
- Deleted assignments do not reappear.

## Calendar

1. Open the calendar page.
2. Confirm fixed events appear.
3. Confirm AI study blocks appear.
4. Confirm there are no duplicate entries.
5. Confirm there are no overlaps.

Expected result:
- Calendar shows the same records Mission uses.
- Important fixed events and AI study work are visible together.

## Courses

1. Open a course dashboard.
2. Add or update assignments and grades.
3. Refresh the page.
4. Confirm the course totals update correctly.

Expected result:
- Assignments and grades group by course.
- Course averages and recommendations update from the shared state.

## Google Calendar

1. Connect Google Calendar.
2. Import events.
3. Sync again.
4. Refresh the page.
5. Disconnect.

Expected result:
- Imported events persist in the shared state.
- Imported events stay fixed.
- Disconnect clears the connection cleanly.

## Reliability

1. Open the app on a fresh session.
2. Watch loading states.
3. Trigger an empty state.
4. Trigger an error state by disconnecting the network or breaking a required env value locally.

Expected result:
- No blank screens.
- Loading states are visible.
- Errors are shown clearly to the user.
