import type { StudentState } from "./student-state";

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

  currentMission: null,
  missionHistory: [],

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
  missionHiddenEventIds: [],
};

export function mergeWithDefaultState(value: Partial<StudentState>): StudentState {
  return {
    ...defaultStudentState,
    ...value,
    profile: {
      ...defaultStudentState.profile,
      ...value.profile,
    },
    status: {
      ...defaultStudentState.status,
      ...value.status,
    },
    memory: {
      ...defaultStudentState.memory,
      ...value.memory,
    },
    assignments: value.assignments || [],
    courses: value.courses || [],
    calendar: value.calendar || [],
    documents: value.documents || [],
    grades: value.grades || [],
    studySessions: value.studySessions || [],
    reflections: value.reflections || [],
    goals: value.goals || [],
    missionHistory: value.missionHistory || [],
    integrationPermissions: value.integrationPermissions || [],
    integrations: value.integrations || [],
    academicSignals: value.academicSignals || [],
    notifications: value.notifications || [],
    dailyBriefings: value.dailyBriefings || [],
    ingestionReviewQueue: value.ingestionReviewQueue || [],
    missionHiddenEventIds: value.missionHiddenEventIds || [],
  };
}
