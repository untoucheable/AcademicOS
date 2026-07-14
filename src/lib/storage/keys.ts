export const STORAGE_KEYS = {
  ASSIGNMENTS: "academic-os:assignments",
  DOCUMENTS: "academic-os:documents",
  SETTINGS: "academic-os:settings",
  POMODORO: "academic-os:pomodoro",
  PROFILE: "academic-os:profile",
  GRADES: "academic-os:grades",
  STUDY_SESSIONS: "academic-os:study-sessions",
  REFLECTIONS: "academic-os:reflections",
  GOALS: "academic-os:goals",
} as const;

export const DEFAULT_SETTINGS = {
  username: "Student",
  darkMode: false,
  mode: "student" as const,
} as const;

export const DEFAULT_POMODORO = {
  workDuration: 25 * 60,
  breakDuration: 5 * 60,
  timeLeft: 25 * 60,
  isRunning: false,
  mode: "work" as const,
  sessionsCompleted: 0,
  totalFocusSeconds: 0,
  startedAt: null,
};
