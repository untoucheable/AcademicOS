import { calculateGradeAverage, buildSubjectIntelligence } from "./academic-analytics";
import type { Assignment } from "./assignment";
import type { Grade } from "./grades";
import type { StudySession, StudentProfile } from "./types";
import type { Memory } from "./memory";

export type AcademicDocument = {
  id?: string;
  title: string;
  content: string;
  subject?: string;
  courseId?: string;
  tags?: string[];
  source?: {
    provider: string;
  };
};

export type Course = {
  id: string;
  name: string;
  subject: string;
  currentAverage: number | null;
  targetAverage: number | null;
  assignmentCount: number;
  upcomingAssignments: Array<{
    id: string;
    title: string;
    dueDate: string;
    completed: boolean;
  }>;
  notesCount: number;
  studyMinutes: number;
  weakTopics: string[];
  recommendation: string;
};

export type AcademicNotification = {
  id: string;
  title: string;
  body: string;
  level: "info" | "success" | "warning" | "critical";
  createdAt: string;
  relatedCourseId?: string;
  relatedAssignmentId?: string;
  reason?: string;
};

export type IntegrationConnection = {
  provider: string;
  connected: boolean;
  lastSyncAt: string | null;
  syncStatus: "idle" | "syncing" | "success" | "error";
  permissions: string[];
  importedItemCount: number;
  error?: string;
  syncHistory: Array<{
    id: string;
    syncedAt: string;
    status: "success" | "error";
    summary: string;
    itemCount: number;
  }>;
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function normalizeOptional(value?: string) {
  return normalize(value || "");
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function deriveCourses({
  profile,
  assignments,
  documents,
  grades,
  studySessions,
  memory,
}: {
  profile: StudentProfile;
  assignments: Assignment[];
  documents: AcademicDocument[];
  grades: Grade[];
  studySessions: StudySession[];
  memory?: Memory;
}): Course[] {
  const fallbackMemory: Memory = {
    hardestSubject: "",
    easiestSubject: "",
    averageEnergyLevel: 5,
    burnoutThresholdHours: 3,
    preferredStudySessionLength: 45,
    preferredBreakLength: 10,
    subjectPerformance: [],
    dailyPatterns: [],
    mistakePatterns: [],
    learningPreferences: [],
    notes: [],
  };
  const subjectIntel = buildSubjectIntelligence(grades, memory || fallbackMemory);
  const subjects = unique([
    ...(Array.isArray(profile.subjects) ? profile.subjects : []),
    ...grades.map((grade) => grade.subject),
    ...assignments.map((assignment) => assignment.course),
    ...documents.map((document) => document.subject || ""),
    ...studySessions.map((session) => session.subject),
  ]);

  return subjects.map((subject) => {
    const grade = grades.find((item) => normalize(item.subject) === normalize(subject));
    const subjectPerformance = subjectIntel.find((item) => normalize(item.subject) === normalize(subject));
    const currentAverage = grade ? calculateGradeAverage(grade) : null;
    const targetAverage = grade?.targetAverage ?? null;
    const subjectAssignments = assignments.filter((assignment) => {
      const title = normalize(assignment.title);
      const course = normalize(assignment.course);
      const assignmentSubject = normalizeOptional(assignment.subject);
      const normalizedSubject = normalize(subject);

      return (
        course === normalizedSubject ||
        assignmentSubject === normalizedSubject ||
        title.includes(normalizedSubject) ||
        course.includes(normalizedSubject)
      );
    });
    const activeAssignments = subjectAssignments.filter((assignment) => !assignment.completed);
    const upcomingAssignments = [...activeAssignments]
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 3)
      .map((assignment) => ({
        id: assignment.id,
        title: assignment.title,
        dueDate: assignment.dueDate,
        completed: assignment.completed,
      }));
    const notesCount = documents.filter((document) => {
      return (
        normalizeOptional(document.subject) === normalize(subject) ||
        normalize(document.title).includes(normalize(subject)) ||
        normalize(document.content).includes(normalize(subject))
      );
    }).length;
    const studyMinutes = studySessions
      .filter((session) => normalize(session.subject) === normalize(subject))
      .reduce((total, session) => total + session.durationMinutes, 0);

    let recommendation = "Add coursework to unlock recommendations.";
    if (currentAverage !== null && targetAverage !== null) {
      recommendation =
        currentAverage < targetAverage
          ? `Focus on practice for ${subject} until the average reaches ${targetAverage}%.`
          : `Keep momentum in ${subject} and maintain your current rhythm.`;
    } else if (activeAssignments.length > 0) {
      recommendation = `Start with ${activeAssignments[0].title} and work toward the next deadline.`;
    } else if (notesCount > 0) {
      recommendation = `Review your ${subject} notes and turn them into a short quiz.`;
    }

    return {
      id: normalize(subject),
      name: subject,
      subject,
      currentAverage,
      targetAverage,
      assignmentCount: activeAssignments.length,
      upcomingAssignments,
      notesCount,
      studyMinutes,
      weakTopics: subjectPerformance ? [subjectPerformance.status === "at-risk" ? "core practice" : "retention"] : [],
      recommendation,
    };
  });
}

export function deriveNotifications({
  assignments,
  grades,
  documents,
  studySessions,
  now = new Date().toISOString(),
}: {
  assignments: Assignment[];
  grades: Grade[];
  documents: AcademicDocument[];
  studySessions: StudySession[];
  now?: string;
}): AcademicNotification[] {
  const notifications: AcademicNotification[] = [];

  const dueSoon = assignments
    .filter((assignment) => !assignment.completed)
    .filter((assignment) => {
      const due = new Date(assignment.dueDate).getTime();
      const today = new Date(now).getTime();
      const days = Math.ceil((due - today) / (24 * 60 * 60 * 1000));
      return days >= 0 && days <= 3;
    })
    .slice(0, 3);

  dueSoon.forEach((assignment) => {
    notifications.push({
      id: `assignment-${assignment.id}`,
      title: "Upcoming deadline",
      body: `${assignment.title} is coming up soon in ${assignment.course}.`,
      level: "warning",
      createdAt: now,
      relatedAssignmentId: assignment.id,
      reason: "Deadline within 3 days",
    });
  });

  const recentGrade = grades.at(-1);
  if (recentGrade) {
    notifications.push({
      id: `grade-${recentGrade.subject}`,
      title: "Grade updated",
      body: `${recentGrade.subject} now sits at ${Math.round(calculateGradeAverage(recentGrade))}%.`,
      level: "info",
      createdAt: now,
      relatedCourseId: recentGrade.subject,
      reason: "Latest grade entry recorded",
    });
  }

  if (documents.length > 0) {
    const latestDocument = documents[0];
    notifications.push({
      id: `document-${latestDocument.id}`,
      title: "New academic material",
      body: `${latestDocument.title} is available in your knowledge base.`,
      level: "success",
      createdAt: now,
      reason: "Document added or updated",
    });
  }

  if (studySessions.length > 0) {
    const latestSession = studySessions[0];
    notifications.push({
      id: `study-${latestSession.id}`,
      title: "Study session logged",
      body: `${latestSession.subject} for ${latestSession.durationMinutes} minutes was added to your history.`,
      level: "info",
      createdAt: now,
      reason: "Study history updated",
    });
  }

  return notifications.slice(0, 6);
}
