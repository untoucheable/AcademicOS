import type { CalendarEventType } from "./calendar";

export type { Assignment, AssignmentPriority } from "./assignment";

export type Document = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  subject?: string;
  courseId?: string;
  tags?: string[];
  type?: "notes" | "pdf" | "assignment" | "study-guide";
  source?: {
    provider: string;
    externalId?: string;
    url?: string;
    importedAt: string;
  };
};

export type AppSettings = {
  username: string;
  darkMode: boolean;
  mode: "student" | "teacher" | "parent";
};

export type StudentProfile = {
  name: string;
  grade: number;
  school: string;
  semesterGoal: number;
  subjects: string[];
  goals: string[];
  preferredStudyStyle: "flashcards" | "practice-problems" | "summaries" | "videos" | "teaching-back";
  availableHoursPerWeek: number;
  extracurriculars: string[];
};

export type StudySession = {
  id: string;
  subject: string;
  durationMinutes: number;
  productivity: number;
  notes?: string;
  createdAt: string;
};

export type ReflectionEntry = {
  id: string;
  prompt: string;
  response: string;
  createdAt: string;
};

export type AcademicGoal = {
  id: string;
  title: string;
  targetDate?: string;
  progress: number;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
};

export type PomodoroMode = "work" | "break";

export type PomodoroState = {
  workDuration: number;
  breakDuration: number;
  timeLeft: number;
  isRunning: boolean;
  mode: PomodoroMode;
  sessionsCompleted: number;
  totalFocusSeconds: number;
  startedAt: string | null;
};

export type AssignmentFilter = "all" | "active" | "due-soon" | "completed";

export type ActivityItem = {
  id: string;
  action: string;
  item: string;
  timestamp: string;
};
// =========================
// AcademicOS AI Types
// =========================

export type EnergyLevel = "high" | "medium" | "low";

export type DailyPlanTemplateId =
  | "training-day"
  | "refereeing-day"
  | "late-practice-day"
  | "early-practice-day";

export type DailyPlanSchoolMode = "auto" | "skip";

export type MissionManualBlock = {
  id: string;
  title: string;
  type: CalendarEventType;
  startTime: string;
  endTime: string;
  relatedAssignmentId?: string;
  calendarEventId?: string;
};

export type DailyMissionPlan = {
  date: string;
  templateId: DailyPlanTemplateId;
  energyLevel: EnergyLevel;
  focusScore?: number;
  majorUpdates: string;
  schoolMode?: DailyPlanSchoolMode;
  stressLevel?: number;
  burnoutRisk?: number;
  sleepTarget?: string;
  manualBlocks?: MissionManualBlock[];
  updatedAt: string;
};

export type TutorMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type AnalyticsInsight = {
  summary: string;
  weeklyOutlook: string;
  burnoutAdvice: string;
  topPriorities: string[];
  generatedAt: string;
  source: "ai" | "deterministic";
};

export type PlanItem = {
  id: string;
  title: string;
  subject?: string;
  estimatedMinutes: number;
  priority: number;
  reason: string;
  impactOnGrade: number;
  urgency: number;
  difficulty: number;
  energyRequired: "low" | "medium" | "high";
};

export type DailyMission = {
  energyLevel: EnergyLevel;
  focusScore: number;
  expectedFinishTime: string;
  summary: string;
  riskOfBurnout: number;
  plan: PlanItem[];
};
