import { AcademicSignal } from "./academic-core";
import { Assignment } from "./assignment";
import { StudentState } from "./student-state";

export type DailyBriefing = {
  id: string;
  createdAt: string;
  currentTime: string;
  summary: string;
  importantSignals: AcademicSignal[];
  recommendedFocusMinutes: number;
  recommendedRecoveryMinutes: number;
};

export type AcademicIntelligenceSnapshot = {
  signals: AcademicSignal[];
  briefing: DailyBriefing;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function daysUntil(date: string, currentTime: string) {
  return Math.ceil((new Date(date).getTime() - new Date(currentTime).getTime()) / DAY_MS);
}

function signalId(type: AcademicSignal["type"], key: string) {
  return `${type}-${key}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
}

function buildDeadlineSignals(assignments: Assignment[], currentTime: string): AcademicSignal[] {
  return assignments
    .filter((assignment) => !assignment.completed)
    .map((assignment) => ({
      assignment,
      daysLeft: daysUntil(assignment.dueDate, currentTime),
    }))
    .filter(({ daysLeft }) => daysLeft <= 3)
    .map(({ assignment, daysLeft }) => ({
      id: signalId("deadline-risk", assignment.id),
      type: "deadline-risk",
      title: `${assignment.title} is due soon`,
      summary:
        daysLeft <= 0
          ? "This assignment is due today or overdue and should be considered for the mission."
          : `This assignment is due in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`,
      priority: daysLeft <= 0 ? 10 : assignment.priority === "high" ? 9 : 7,
      confidence: assignment.source?.confidence || {
        score: 1,
        reason: "Assignment exists in AcademicOS state.",
        needsConfirmation: false,
      },
      relatedAssignmentId: assignment.id,
      relatedSubject: assignment.subject,
      createdAt: currentTime,
    }));
}

function buildWeakSubjectSignals(state: StudentState, currentTime: string): AcademicSignal[] {
  return state.memory.subjectPerformance
    .filter((subject) => subject.difficultyForUser >= 7 || subject.averageGrade < state.profile.semesterGoal)
    .map((subject) => ({
      id: signalId("weak-subject", subject.subject),
      type: "weak-subject",
      title: `${subject.subject} needs attention`,
      summary: "This subject is below target or consistently feels difficult for the student.",
      priority: subject.difficultyForUser >= 8 ? 8 : 6,
      confidence: {
        score: 0.8,
        reason: "Derived from stored subject performance and student memory.",
        needsConfirmation: false,
      },
      relatedSubject: subject.subject,
      createdAt: currentTime,
    }));
}

function buildBurnoutSignal(state: StudentState, currentTime: string): AcademicSignal[] {
  const workloadMinutes = state.assignments
    .filter((assignment) => !assignment.completed)
    .reduce((total, assignment) => total + (assignment.estimatedMinutes || 45), 0);
  const thresholdMinutes = state.memory.burnoutThresholdHours * 60;
  const lowEnergy = state.status.energyLevel <= 3 || state.status.stressLevel >= 8;

  if (workloadMinutes < thresholdMinutes && !lowEnergy) return [];

  return [
    {
      id: signalId("burnout-risk", currentTime),
      type: "burnout-risk",
      title: "Workload may exceed sustainable capacity",
      summary: lowEnergy
        ? "Energy or stress levels suggest the mission should reduce workload and add recovery time."
        : "Remaining estimated work is above the student's stored burnout threshold.",
      priority: lowEnergy ? 10 : 8,
      confidence: {
        score: 0.75,
        reason: "Derived from current energy, stress, workload, and memory thresholds.",
        needsConfirmation: false,
      },
      createdAt: currentTime,
    },
  ];
}

function buildDailyBriefing(
  state: StudentState,
  currentTime: string,
  signals: AcademicSignal[]
): DailyBriefing {
  const topSignals = [...signals].sort((a, b) => b.priority - a.priority).slice(0, 5);
  const burnoutSignal = topSignals.find((signal) => signal.type === "burnout-risk");

  return {
    id: `briefing-${currentTime}`,
    createdAt: currentTime,
    currentTime,
    summary: topSignals.length
      ? `AcademicOS found ${topSignals.length} item${topSignals.length === 1 ? "" : "s"} that should shape today's mission.`
      : "AcademicOS did not find urgent academic risks yet.",
    importantSignals: topSignals,
    recommendedFocusMinutes: burnoutSignal
      ? Math.max(30, state.memory.preferredStudySessionLength)
      : state.memory.preferredStudySessionLength * 2,
    recommendedRecoveryMinutes: burnoutSignal ? state.memory.preferredBreakLength * 3 : state.memory.preferredBreakLength,
  };
}

export function buildAcademicIntelligenceSnapshot(
  state: StudentState,
  currentTime: string
): AcademicIntelligenceSnapshot {
  const signals = [
    ...buildDeadlineSignals(state.assignments, currentTime),
    ...buildWeakSubjectSignals(state, currentTime),
    ...buildBurnoutSignal(state, currentTime),
  ].sort((a, b) => b.priority - a.priority);

  return {
    signals,
    briefing: buildDailyBriefing(state, currentTime, signals),
  };
}
