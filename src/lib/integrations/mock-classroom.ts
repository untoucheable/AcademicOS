import { ingestAssignmentWithReview, ingestCalendarEventWithReview } from "@/lib/intake-pipeline";
import { StudentState } from "@/lib/student-state";

const confidence = {
  score: 0.98,
  reason: "Imported from mock classroom fixture.",
  needsConfirmation: false,
};

export function importMockClassroom(state: StudentState, currentTime: string) {
  const now = new Date(currentTime);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(23, 59, 0, 0);

  const threeDays = new Date(now);
  threeDays.setDate(now.getDate() + 3);
  threeDays.setHours(23, 59, 0, 0);

  const sourceBase = {
    provider: "google-classroom" as const,
    importedAt: currentTime,
    lastSyncedAt: currentTime,
    confidence,
  };

  const withBiology = ingestAssignmentWithReview(state, {
    title: "Biology Chapter 5 Review Questions",
    course: "Biology",
    subject: "Biology",
    dueDate: tomorrow.toISOString(),
    priority: "high",
    estimatedMinutes: 60,
    notes: "Complete the review questions for the genetics unit.",
    source: {
      ...sourceBase,
      externalId: "mock-biology-review",
      url: "https://classroom.example/mock-biology-review",
    },
  });

  const withEnglish = ingestAssignmentWithReview(withBiology.state, {
    title: "English Essay Draft",
    course: "English",
    subject: "English",
    dueDate: threeDays.toISOString(),
    priority: "medium",
    estimatedMinutes: 90,
    notes: "Prepare a first draft with thesis, outline, and two body paragraphs.",
    source: {
      ...sourceBase,
      externalId: "mock-english-essay-draft",
      url: "https://classroom.example/mock-english-essay-draft",
    },
  });

  return ingestCalendarEventWithReview(withEnglish.state, {
    title: "Biology class",
    type: "school",
    startTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0).toISOString(),
    endTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 0).toISOString(),
    priority: 8,
    source: {
      ...sourceBase,
      externalId: "mock-biology-class",
      url: "https://classroom.example/mock-biology-class",
    },
  }).state;
}
