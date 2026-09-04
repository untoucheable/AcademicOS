import type { StudentState } from "./student-state";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeObject<T extends Record<string, unknown>>(base: T, value: unknown): T {
  if (!isPlainObject(value)) return base;
  return { ...base, ...value } as T;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asNullableObject<T extends Record<string, unknown>>(value: unknown): T | null {
  return isPlainObject(value) ? (value as T) : null;
}

export const defaultStudentState: StudentState = {
  profile: {
    name: "",
    grade: 0,
    school: "",
    semesterGoal: 0,
    subjects: [],
    goals: [],
    preferredStudyStyle: "practice-problems",
    availableHoursPerWeek: 10,
    extracurriculars: [],
  },

  status: {
    currentTime: "",
    energyLevel: 5,
    stressLevel: 5,
    burnoutRisk: 0,
  },

  assignments: [],
  courses: [],
  calendar: [],
  documents: [],
  grades: [],
  studySessions: [],
  reflections: [],
  goals: [],
  dailyMissionPlan: null,
  calendarFollowUpQueue: [],
  resolvedCalendarEventKeys: [],
  missionHiddenEventTitles: [],

  currentMission: null,
  missionHistory: [],
  missionHiddenEventIds: [],

  memory: {
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
  },

  integrationPermissions: [],
  integrations: [],
  academicSignals: [],
  notifications: [],
  dailyBriefings: [],
  ingestionReviewQueue: [],
};

export function mergeWithDefaultState(value: Partial<StudentState>): StudentState {
  return {
    ...defaultStudentState,
    ...value,
    profile: mergeObject(defaultStudentState.profile, value.profile),
    status: mergeObject(defaultStudentState.status, value.status),
    memory: mergeObject(defaultStudentState.memory, value.memory),
    assignments: asArray(value.assignments),
    courses: asArray(value.courses),
    calendar: asArray(value.calendar),
    documents: asArray(value.documents),
    grades: asArray(value.grades),
    studySessions: asArray(value.studySessions),
    reflections: asArray(value.reflections),
    goals: asArray(value.goals),
    dailyMissionPlan: asNullableObject(value.dailyMissionPlan),
    calendarFollowUpQueue: asArray(value.calendarFollowUpQueue),
    resolvedCalendarEventKeys: asArray(value.resolvedCalendarEventKeys),
    missionHiddenEventTitles: asArray(value.missionHiddenEventTitles),
    currentMission: asNullableObject(value.currentMission),
    missionHistory: asArray(value.missionHistory),
    missionHiddenEventIds: asArray(value.missionHiddenEventIds),
    integrationPermissions: asArray(value.integrationPermissions),
    integrations: asArray(value.integrations),
    academicSignals: asArray(value.academicSignals),
    notifications: asArray(value.notifications),
    dailyBriefings: asArray(value.dailyBriefings),
    ingestionReviewQueue: asArray(value.ingestionReviewQueue),
  };
}
