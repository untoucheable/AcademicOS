export type AssignmentPriority = "low" | "medium" | "high";

export type Assignment = {
  id: string;
  title: string;
  course: string;
  dueDate: string;
  priority: AssignmentPriority;
  completed: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type Document = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type AppSettings = {
  username: string;
  darkMode: boolean;
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
