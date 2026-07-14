import { ingestAssignmentWithReview } from "@/lib/intake-pipeline";
import { StudentState } from "@/lib/student-state";

const confidence = {
  score: 0.92,
  reason: "Detected from mock teacher email announcement.",
  needsConfirmation: false,
};

export function importMockTeacherEmail(state: StudentState, currentTime: string) {
  const now = new Date(currentTime);
  const monday = new Date(now);
  const daysUntilMonday = (8 - monday.getDay()) % 7 || 7;
  monday.setDate(now.getDate() + daysUntilMonday);
  monday.setHours(23, 59, 0, 0);

  return ingestAssignmentWithReview(state, {
    title: "Biology Genetics Test Preparation",
    course: "Biology",
    subject: "Biology",
    assessmentType: "test",
    dueDate: monday.toISOString(),
    priority: "high",
    estimatedMinutes: 120,
    notes: "Mock teacher email: Biology test moved to Monday. Review genetics notes and practice Punnett squares.",
    source: {
      provider: "gmail",
      externalId: "mock-email-biology-test-moved",
      url: "mailto:teacher@example.edu",
      importedAt: currentTime,
      lastSyncedAt: currentTime,
      confidence,
    },
  }).state;
}
