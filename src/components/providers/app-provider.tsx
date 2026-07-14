"use client";

import { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { calculateGradeAverage } from "@/lib/academic-analytics";
import { deriveMemorySnapshot } from "@/lib/memory-engine";
import { deriveCourses, deriveNotifications, type AcademicNotification, type Course } from "@/lib/academic-graph";
import { DEFAULT_POMODORO, DEFAULT_SETTINGS, STORAGE_KEYS } from "@/lib/storage/keys";
import { generateId } from "@/lib/storage/helpers";
import type {
  ActivityItem,
  AcademicGoal,
  AppSettings,
  Assignment,
  ReflectionEntry,
  Document,
  PomodoroState,
  StudentProfile,
  StudySession,
} from "@/lib/types";
import type { Grade } from "@/lib/grades";
import type { Memory } from "@/lib/memory";

const DEFAULT_PROFILE: StudentProfile = {
  name: "Student",
  grade: 0,
  school: "",
  semesterGoal: 0,
  subjects: [],
  goals: [],
  preferredStudyStyle: "practice-problems",
  availableHoursPerWeek: 10,
  extracurriculars: [],
};

function normalizeProfile(profile: StudentProfile): StudentProfile {
  return {
    ...DEFAULT_PROFILE,
    ...profile,
    subjects: Array.isArray(profile.subjects) ? profile.subjects : DEFAULT_PROFILE.subjects,
    goals: Array.isArray(profile.goals) ? profile.goals : DEFAULT_PROFILE.goals,
    extracurriculars: Array.isArray(profile.extracurriculars)
      ? profile.extracurriculars
      : DEFAULT_PROFILE.extracurriculars,
  };
}

type AppContextValue = {
  isLoaded: boolean;
  assignments: Assignment[];
  documents: Document[];
  profile: StudentProfile;
  courses: Course[];
  grades: Grade[];
  memory: Memory;
  studySessions: StudySession[];
  reflections: ReflectionEntry[];
  goals: AcademicGoal[];
  notifications: AcademicNotification[];
  settings: AppSettings;
  pomodoro: PomodoroState;
  addAssignment: (data: Omit<Assignment, "id" | "createdAt" | "updatedAt" | "completed">) => void;
  updateAssignment: (id: string, data: Partial<Omit<Assignment, "id" | "createdAt">>) => void;
  deleteAssignment: (id: string) => void;
  toggleAssignmentComplete: (id: string) => void;
  addDocument: (title?: string) => string;
  updateDocument: (id: string, data: Partial<Pick<Document, "title" | "content">>) => void;
  deleteDocument: (id: string) => void;
  updateProfile: (data: Partial<StudentProfile>) => void;
  addGrade: (data: {
    subject: string;
    assignmentName: string;
    score: number;
    maxScore: number;
    weight?: number;
    targetAverage?: number;
  }) => void;
  addStudySession: (data: Omit<StudySession, "id" | "createdAt">) => void;
  addReflection: (data: Omit<ReflectionEntry, "id" | "createdAt">) => void;
  addGoal: (
    data: Omit<AcademicGoal, "id" | "progress" | "createdAt" | "updatedAt"> & { progress?: number }
  ) => void;
  updateGoal: (id: string, data: Partial<Omit<AcademicGoal, "id">>) => void;
  updateSettings: (data: Partial<AppSettings>) => void;
  setPomodoro: (value: PomodoroState | ((prev: PomodoroState) => PomodoroState)) => void;
  deleteGradeEntry: (subject: string, entryId: string) => void;
  resetAllData: () => Promise<void>;
  recentActivity: ActivityItem[];
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [assignments, setAssignments, assignmentsLoaded] = useLocalStorage<Assignment[]>(
    STORAGE_KEYS.ASSIGNMENTS,
    [],
  );
  const [documents, setDocuments, documentsLoaded] = useLocalStorage<Document[]>(
    STORAGE_KEYS.DOCUMENTS,
    [],
  );
  const [profile, setProfile, profileLoaded] = useLocalStorage<StudentProfile>(
    STORAGE_KEYS.PROFILE,
    DEFAULT_PROFILE,
  );
  const [grades, setGrades, gradesLoaded] = useLocalStorage<Grade[]>(STORAGE_KEYS.GRADES, []);
  const [studySessions, setStudySessions, studySessionsLoaded] = useLocalStorage<StudySession[]>(
    STORAGE_KEYS.STUDY_SESSIONS,
    [],
  );
  const [reflections, setReflections, reflectionsLoaded] = useLocalStorage<ReflectionEntry[]>(
    STORAGE_KEYS.REFLECTIONS,
    [],
  );
  const [goals, setGoals, goalsLoaded] = useLocalStorage<AcademicGoal[]>(
    STORAGE_KEYS.GOALS,
    [],
  );
  const [settings, setSettings, settingsLoaded] = useLocalStorage<AppSettings>(
    STORAGE_KEYS.SETTINGS,
    { ...DEFAULT_SETTINGS },
  );
  const [pomodoro, setPomodoro, pomodoroLoaded] = useLocalStorage<PomodoroState>(
    STORAGE_KEYS.POMODORO,
    { ...DEFAULT_POMODORO },
  );

  const isLoaded =
    assignmentsLoaded &&
    documentsLoaded &&
    profileLoaded &&
    gradesLoaded &&
    studySessionsLoaded &&
    reflectionsLoaded &&
    goalsLoaded &&
    settingsLoaded &&
    pomodoroLoaded;

  useEffect(() => {
    if (!isLoaded) return;
    document.documentElement.classList.toggle("dark", settings.darkMode);
  }, [settings.darkMode, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    const normalized = normalizeProfile(profile);
    if (
      normalized.name !== profile.name ||
      normalized.grade !== profile.grade ||
      normalized.school !== profile.school ||
      normalized.semesterGoal !== profile.semesterGoal ||
      normalized.preferredStudyStyle !== profile.preferredStudyStyle ||
      normalized.availableHoursPerWeek !== profile.availableHoursPerWeek ||
      normalized.subjects !== profile.subjects ||
      normalized.goals !== profile.goals ||
      normalized.extracurriculars !== profile.extracurriculars
    ) {
      setProfile(normalized);
    }
  }, [isLoaded, profile, setProfile]);

  useEffect(() => {
    if (!isLoaded) return;
    if (settings.mode) return;
    setSettings((prev) => ({ ...prev, mode: "student" }));
  }, [isLoaded, setSettings, settings.mode]);

  const addAssignment = useCallback(
    (data: Omit<Assignment, "id" | "createdAt" | "updatedAt" | "completed">) => {
      const now = new Date().toISOString();
      const assignment: Assignment = {
        ...data,
        id: generateId(),
        completed: false,
        createdAt: now,
        updatedAt: now,
      };
      setAssignments((prev) => [...prev, assignment]);
    },
    [setAssignments],
  );

  const updateAssignment = useCallback(
    (id: string, data: Partial<Omit<Assignment, "id" | "createdAt">>) => {
      setAssignments((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, ...data, updatedAt: new Date().toISOString() } : a,
        ),
      );
    },
    [setAssignments],
  );

  const deleteAssignment = useCallback(
    (id: string) => {
      setAssignments((prev) => prev.filter((a) => a.id !== id));
    },
    [setAssignments],
  );

  const toggleAssignmentComplete = useCallback(
    (id: string) => {
      setAssignments((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, completed: !a.completed, updatedAt: new Date().toISOString() }
            : a,
        ),
      );
    },
    [setAssignments],
  );

  const addDocument = useCallback(
    (title = "Untitled Note") => {
      const now = new Date().toISOString();
      const doc: Document = {
        id: generateId(),
        title,
        content: "",
        createdAt: now,
        updatedAt: now,
      };
      setDocuments((prev) => [doc, ...prev]);
      return doc.id;
    },
    [setDocuments],
  );

  const updateDocument = useCallback(
    (id: string, data: Partial<Pick<Document, "title" | "content">>) => {
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === id ? { ...d, ...data, updatedAt: new Date().toISOString() } : d,
        ),
      );
    },
    [setDocuments],
  );

  const deleteDocument = useCallback(
    (id: string) => {
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    },
    [setDocuments],
  );

  const updateProfile = useCallback(
    (data: Partial<StudentProfile>) => {
      setProfile((prev) => ({ ...prev, ...data }));
    },
    [setProfile],
  );

  const addGrade = useCallback(
    (data: {
      subject: string;
      assignmentName: string;
      score: number;
      maxScore: number;
      weight?: number;
      targetAverage?: number;
    }) => {
      const now = new Date().toISOString();
      const entry = {
        id: generateId(),
        subject: data.subject,
        assignmentName: data.assignmentName,
        score: data.score,
        maxScore: data.maxScore,
        weight: data.weight,
        date: now,
      };
      setGrades((prev) => {
        const existing = prev.find((grade) => grade.subject.toLowerCase() === data.subject.toLowerCase());
        const nextGrade: Grade = existing
          ? {
              ...existing,
              targetAverage: existing.targetAverage || data.targetAverage || 90,
              entries: [entry, ...existing.entries],
              currentAverage: 0,
            }
          : {
              subject: data.subject,
              currentAverage: 0,
              targetAverage: data.targetAverage || 90,
              entries: [entry],
            };

        nextGrade.currentAverage = calculateGradeAverage(nextGrade);

        return existing
          ? prev.map((grade) => (grade.subject.toLowerCase() === data.subject.toLowerCase() ? nextGrade : grade))
          : [...prev, nextGrade];
      });
    },
    [setGrades],
  );

  const addStudySession = useCallback(
    (data: Omit<StudySession, "id" | "createdAt">) => {
      setStudySessions((prev) => [
        {
          ...data,
          id: generateId(),
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    },
    [setStudySessions],
  );

  const addReflection = useCallback(
    (data: Omit<ReflectionEntry, "id" | "createdAt">) => {
      setReflections((prev) => [
        {
          ...data,
          id: generateId(),
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    },
    [setReflections],
  );

  const addGoal = useCallback(
    (data: Omit<AcademicGoal, "id" | "progress" | "createdAt" | "updatedAt"> & { progress?: number }) => {
      const now = new Date().toISOString();
      setGoals((prev) => [
        {
          ...data,
          id: generateId(),
          progress: data.progress ?? 0,
          createdAt: now,
          updatedAt: now,
        },
        ...prev,
      ]);
    },
    [setGoals],
  );

  const updateGoal = useCallback(
    (id: string, data: Partial<Omit<AcademicGoal, "id">>) => {
      setGoals((prev) =>
        prev.map((goal) => (goal.id === id ? { ...goal, ...data, updatedAt: new Date().toISOString() } : goal))
      );
    },
    [setGoals],
  );

  const deleteGradeEntry = useCallback(
    (subject: string, entryId: string) => {
      setGrades((prev) =>
        prev
          .map((grade) => {
            if (grade.subject.toLowerCase() !== subject.toLowerCase()) return grade;

            const entries = grade.entries.filter((entry) => entry.id !== entryId);
            if (!entries.length) return null;

            const nextGrade: Grade = {
              ...grade,
              entries,
              currentAverage: 0,
            };
            nextGrade.currentAverage = calculateGradeAverage(nextGrade);
            return nextGrade;
          })
          .filter((grade): grade is Grade => grade !== null),
      );
    },
    [setGrades],
  );

  const resetAllData = useCallback(async () => {
    try {
      await fetch("/api/academic/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "reset-all" }),
      });
    } catch {
      // Even if the server reset fails, we still clear the client copy below.
    }

    setAssignments([]);
    setDocuments([]);
    setProfile(DEFAULT_PROFILE);
    setGrades([]);
    setStudySessions([]);
    setReflections([]);
    setGoals([]);
    setSettings({ ...DEFAULT_SETTINGS });
    setPomodoro({ ...DEFAULT_POMODORO });
  }, [
    setAssignments,
    setDocuments,
    setGoals,
    setGrades,
    setPomodoro,
    setProfile,
    setReflections,
    setSettings,
    setStudySessions,
  ]);

  const updateSettings = useCallback(
    (data: Partial<AppSettings>) => {
      setSettings((prev) => ({ ...prev, ...data }));
    },
    [setSettings],
  );

  const courses = useMemo(
    () =>
      deriveCourses({
        profile: normalizeProfile(profile),
        assignments,
        documents,
        grades,
        studySessions,
      }),
    [assignments, documents, grades, profile, studySessions],
  );

  const memory = useMemo(
    () =>
      deriveMemorySnapshot({
        profile: normalizeProfile(profile),
        grades,
        assignments,
        studySessions,
        reflections,
      }),
    [assignments, grades, profile, reflections, studySessions],
  );

  const notifications = useMemo(
    () =>
      deriveNotifications({
        assignments,
        grades,
        documents,
        studySessions,
      }),
    [assignments, documents, grades, studySessions],
  );

  const recentActivity = useMemo((): ActivityItem[] => {
    const assignmentActivity: ActivityItem[] = assignments.map((a) => ({
      id: `a-${a.id}`,
      action: a.completed ? "Completed" : "Updated",
      item: a.title,
      timestamp: a.updatedAt,
    }));
    const documentActivity: ActivityItem[] = documents.map((d) => ({
      id: `d-${d.id}`,
      action: "Edited",
      item: d.title,
      timestamp: d.updatedAt,
    }));
    const gradeActivity: ActivityItem[] = grades.flatMap((grade) =>
      grade.entries.map((entry) => ({
        id: `g-${entry.id}`,
        action: "Graded",
        item: `${grade.subject}: ${entry.assignmentName}`,
        timestamp: entry.date,
      }))
    );
    const sessionActivity: ActivityItem[] = studySessions.map((session) => ({
      id: `s-${session.id}`,
      action: "Studied",
      item: `${session.subject} for ${session.durationMinutes}m`,
      timestamp: session.createdAt,
    }));
    const reflectionActivity: ActivityItem[] = reflections.map((reflection) => ({
      id: `r-${reflection.id}`,
      action: "Reflected",
      item: reflection.prompt,
      timestamp: reflection.createdAt,
    }));
    const goalActivity: ActivityItem[] = goals.map((goal) => ({
      id: `goal-${goal.id}`,
      action: "Tracked goal",
      item: goal.title,
      timestamp: goal.updatedAt || goal.createdAt,
    }));
    return [...assignmentActivity, ...documentActivity, ...gradeActivity, ...sessionActivity, ...reflectionActivity, ...goalActivity]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 8);
  }, [assignments, documents, grades, studySessions, reflections, goals]);

  const value: AppContextValue = {
    isLoaded,
    assignments,
    documents,
    profile: normalizeProfile(profile),
    courses,
    grades,
    memory,
    studySessions,
    reflections,
    goals,
    notifications,
    settings,
    pomodoro,
    addAssignment,
    updateAssignment,
    deleteAssignment,
    toggleAssignmentComplete,
    addDocument,
    updateDocument,
    deleteDocument,
    updateProfile,
    addGrade,
    addStudySession,
    addReflection,
    addGoal,
    updateGoal,
    updateSettings,
    setPomodoro,
    deleteGradeEntry,
    resetAllData,
    recentActivity,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within AppProvider");
  }
  return context;
}
