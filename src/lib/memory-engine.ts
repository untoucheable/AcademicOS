import type { Assignment } from "./assignment";
import type { Grade } from "./grades";
import type { Memory } from "./memory";
import type { ReflectionEntry, StudentProfile, StudySession } from "./types";

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function getStudyHourLabel(date: string) {
  const hour = new Date(date).getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export function deriveMemorySnapshot({
  profile,
  grades,
  assignments,
  studySessions,
  reflections,
}: {
  profile: StudentProfile;
  grades: Grade[];
  assignments: Assignment[];
  studySessions: StudySession[];
  reflections: ReflectionEntry[];
}): Memory {
  const subjectPerformance = grades.map((grade) => {
    const averageGrade = grade.currentAverage || 0;
    const difficultyForUser = Math.max(1, Math.min(10, Math.round((100 - averageGrade) / 8)));
    const timeMultiplier = averageGrade < grade.targetAverage ? 1.4 : 1;

    return {
      subject: grade.subject,
      averageGrade,
      difficultyForUser,
      timeMultiplier,
    };
  });

  const sessionDurations = studySessions.map((session) => session.durationMinutes);
  const averageProductivity = average(studySessions.map((session) => session.productivity));
  const studyMinutes = sessionDurations.length ? median(sessionDurations) : profile.availableHoursPerWeek * 60;
  const activeAssignmentMinutes = assignments
    .filter((assignment) => !assignment.completed)
    .reduce((total, assignment) => total + (assignment.estimatedMinutes || 45), 0);
  const hardestSubject = [...subjectPerformance].sort((a, b) => a.averageGrade - b.averageGrade)[0]?.subject || profile.subjects[0] || "";
  const easiestSubject = [...subjectPerformance].sort((a, b) => b.averageGrade - a.averageGrade)[0]?.subject || profile.subjects[0] || "";
  const dailyPatterns = ["morning", "afternoon", "evening"].map((timeOfDay) => ({
    timeOfDay: timeOfDay as "morning" | "afternoon" | "evening",
    focusLevel:
      Math.max(
        1,
        Math.min(
          10,
          Math.round(
            average(
              studySessions
                .filter((session) => getStudyHourLabel(session.createdAt) === timeOfDay)
                .map((session) => session.productivity),
            ) || averageProductivity || 5,
          ),
        ),
      ),
    productivity: Math.max(1, Math.min(10, Math.round(averageProductivity || 5))),
  }));

  return {
    hardestSubject,
    easiestSubject,
    averageEnergyLevel: Math.max(1, Math.min(10, Math.round(averageProductivity || 5))),
    burnoutThresholdHours: Math.max(
      2,
      Math.min(6, Math.round((profile.availableHoursPerWeek || 10) / 2 + activeAssignmentMinutes / 600)),
    ),
    preferredStudySessionLength: Math.max(25, Math.min(90, Math.round(studyMinutes || 45))),
    preferredBreakLength: Math.max(5, Math.min(20, Math.round((studyMinutes || 45) / 4))),
    subjectPerformance,
    dailyPatterns,
    mistakePatterns: [],
    learningPreferences: [
      {
        method: profile.preferredStudyStyle,
        effectiveness: Math.max(1, Math.min(10, Math.round(averageProductivity || 6))),
        updatedAt: new Date().toISOString(),
      },
    ],
    notes: reflections.slice(0, 5).map((reflection) => reflection.response),
  };
}
