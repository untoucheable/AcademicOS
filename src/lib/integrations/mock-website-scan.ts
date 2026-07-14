import { IngestedAssignment } from "@/lib/ingestion";
import { ingestAssignmentWithReview } from "@/lib/intake-pipeline";
import { StudentState } from "@/lib/student-state";

export function importMockWebsiteScan(state: StudentState, currentTime: string): StudentState {
  const externalId = "mock-chemistry-unit-4-quiz";
  const now = new Date(currentTime);
  const friday = new Date(now);
  const daysUntilFriday = (5 - friday.getDay() + 7) % 7 || 7;
  friday.setDate(now.getDate() + daysUntilFriday);
  friday.setHours(23, 59, 0, 0);

  const possibleAssignment: IngestedAssignment = {
    title: "Possible Chemistry Unit 4 Quiz",
    course: "Chemistry",
    subject: "Chemistry",
    dueDate: friday.toISOString(),
    priority: "medium",
    estimatedMinutes: 45,
    notes: "Mock website scanner found text that may indicate a Unit 4 quiz this Friday.",
    source: {
      provider: "website-scanner",
      externalId,
      url: "https://school.example/chemistry/unit-4",
      importedAt: currentTime,
      lastSyncedAt: currentTime,
      confidence: {
        score: 0.68,
        reason: "The page text mentions a Unit 4 quiz, but the wording is not explicit enough to auto-import.",
        needsConfirmation: true,
      },
    },
  };

  return ingestAssignmentWithReview(state, possibleAssignment).state;
}
