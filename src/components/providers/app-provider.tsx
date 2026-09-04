"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { calculateGradeAverage } from "@/lib/academic-analytics";
import { deriveMemorySnapshot } from "@/lib/memory-engine";
import { defaultStudentState, mergeWithDefaultState } from "@/lib/default-state";
import {
  deriveCourses,
  deriveNotifications,
  type AcademicNotification,
  type Course,
} from "@/lib/academic-graph";
import { DEFAULT_POMODORO } from "@/lib/storage/keys";
import { generateId } from "@/lib/storage/helpers";
import type {
  ActivityItem,
  AcademicGoal,
  AppSettings,
  Assignment,
  Document,
  DailyMissionPlan,
  PomodoroState,
  ReflectionEntry,
  StudentProfile,
  StudySession,
  TutorMessage,
} from "@/lib/types";
import type { Grade } from "@/lib/grades";
import type { Memory } from "@/lib/memory";
import type { Mission } from "@/lib/mission";
import type { StudentState } from "@/lib/student-state";
import type { SchoolDocument } from "@/lib/documents";

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

const STATE_ENDPOINT = "/api/state";

function toLocalISOString(date: Date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absoluteOffset / 60)).padStart(2, "0");
  const offsetMins = String(absoluteOffset % 60).padStart(2, "0");
  const pad = (value: number) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
    ":",
    pad(date.getSeconds()),
    offsetSign,
    offsetHours,
    ":",
    offsetMins,
  ].join("");
}

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

async function fetchStudentState(): Promise<StudentState> {
  const response = await fetch(STATE_ENDPOINT, { method: "GET" });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Failed to load AcademicOS state.");
  }

  const state = mergeWithDefaultState((data.state || data) as Partial<StudentState>);

  return {
    ...state,
    documents: state.documents.map((document) => ({
      ...(document as SchoolDocument & { createdAt?: string; updatedAt?: string }),
      type: document.type || "notes",
      subject: document.subject || "",
      uploadedAt:
        "uploadedAt" in document && typeof document.uploadedAt === "string"
          ? document.uploadedAt
          : (document as { createdAt?: string; updatedAt?: string }).createdAt ||
            (document as { createdAt?: string; updatedAt?: string }).updatedAt ||
            new Date().toISOString(),
    })),
  };
}

async function persistStudentState(state: StudentState) {
  const response = await fetch(STATE_ENDPOINT, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ state }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Failed to save AcademicOS state.");
  }

  const data = await response.json().catch(() => ({}));
  return mergeWithDefaultState((data.state || data) as Partial<StudentState>);
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
  status: StudentState["status"];
  pomodoro: PomodoroState;
  dailyMissionPlan: DailyMissionPlan | null;
  currentMission: Mission | null;
  tutorMessages: TutorMessage[];
  analyticsInsight: StudentState["analyticsInsight"];
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
    data: Omit<AcademicGoal, "id" | "progress" | "createdAt" | "updatedAt"> & { progress?: number },
  ) => void;
  updateGoal: (id: string, data: Partial<Omit<AcademicGoal, "id">>) => void;
  updateSettings: (data: Partial<AppSettings>) => void;
  updateStatus: (data: Partial<StudentState["status"]>) => Promise<void>;
  setPomodoro: (value: PomodoroState | ((prev: PomodoroState) => PomodoroState)) => void;
  setDailyMissionPlan: (value: DailyMissionPlan | null) => Promise<void>;
  deleteGradeEntry: (subject: string, entryId: string) => void;
  resetAllData: () => Promise<void>;
  recentActivity: ActivityItem[];
  refreshState: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [studentState, setStudentState] = useState<StudentState>(defaultStudentState);
  const [isLoaded, setIsLoaded] = useState(false);
  const [pomodoro, setPomodoro, pomodoroLoaded] = useLocalStorage<PomodoroState>(
    "academic-os:pomodoro",
    { ...DEFAULT_POMODORO },
  );
  const loadedRef = useRef(false);
  const missionRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;

    void fetchStudentState()
      .then((state) => {
        if (!active) return;
        setStudentState(state);
      })
      .catch(() => {
        if (!active) return;
        setStudentState(defaultStudentState);
      })
      .finally(() => {
        if (!active) return;
        loadedRef.current = true;
        setIsLoaded(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    document.documentElement.classList.toggle("dark", studentState.settings.darkMode);
  }, [isLoaded, studentState.settings.darkMode]);

  const refreshStudentState = useCallback(async () => {
    const next = await fetchStudentState();
    setStudentState(next);
  }, []);

  const refreshMissionState = useCallback(async (reason = "Student data changed") => {
    if (!loadedRef.current) return;

    try {
      await fetch("/api/mission", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: reason,
          currentTime: toLocalISOString(new Date()),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });

      await refreshStudentState();
    } catch {
      // Best effort background rebuild.
    }
  }, [refreshStudentState]);

  const queueMissionRefresh = useCallback((reason = "Student data changed") => {
    if (!loadedRef.current) return;

    if (missionRefreshTimerRef.current) {
      clearTimeout(missionRefreshTimerRef.current);
    }

    missionRefreshTimerRef.current = setTimeout(() => {
      void refreshMissionState(reason);
    }, 600);
  }, [refreshMissionState]);

  const commitStudentState = useCallback((updater: (state: StudentState) => StudentState) => {
    setStudentState((current) => {
      const next = updater(current);
      if (loadedRef.current) {
        void persistStudentState(next).catch((err) => {
          console.error("Failed to persist AcademicOS state:", err);
        });
        queueMissionRefresh("Student data changed");
      }
      return next;
    });
  }, [queueMissionRefresh]);

  const syncConnectedIntegrations = useCallback(async () => {
    try {
      const statusResponse = await fetch("/api/integrations/google/calendar/status");
      if (!statusResponse.ok) return;

      const status = await statusResponse.json().catch(() => ({}));
      if (!status.connected) return;

      const syncResponse = await fetch("/api/integrations/google/calendar/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      if (!syncResponse.ok) return;

      await refreshStudentState();
    } catch {
      // Best-effort background sync.
    }
  }, [refreshStudentState]);

  useEffect(() => {
    if (!isLoaded) return;

    void syncConnectedIntegrations();

    const interval = window.setInterval(() => {
      void syncConnectedIntegrations();
    }, 60 * 60 * 1000);

    return () => window.clearInterval(interval);
  }, [isLoaded, syncConnectedIntegrations]);

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

      commitStudentState((prev) => ({
        ...prev,
        assignments: [...prev.assignments, assignment],
      }));
    },
    [commitStudentState],
  );

  const updateAssignment = useCallback(
    (id: string, data: Partial<Omit<Assignment, "id" | "createdAt">>) => {
      commitStudentState((prev) => ({
        ...prev,
        assignments: prev.assignments.map((assignment) =>
          assignment.id === id ? { ...assignment, ...data, updatedAt: new Date().toISOString() } : assignment,
        ),
      }));
    },
    [commitStudentState],
  );

  const deleteAssignment = useCallback(
    (id: string) => {
      commitStudentState((prev) => ({
        ...prev,
        assignments: prev.assignments.filter((assignment) => assignment.id !== id),
      }));
    },
    [commitStudentState],
  );

  const toggleAssignmentComplete = useCallback(
    (id: string) => {
      commitStudentState((prev) => ({
        ...prev,
        assignments: prev.assignments.map((assignment) =>
          assignment.id === id
            ? {
                ...assignment,
                completed: !assignment.completed,
                updatedAt: new Date().toISOString(),
              }
            : assignment,
        ),
      }));
    },
    [commitStudentState],
  );

  const addDocument = useCallback(
    (title = "Untitled Note") => {
      const now = new Date().toISOString();
      const doc = {
        id: generateId(),
        title,
        content: "",
        type: "notes",
        subject: "",
        uploadedAt: now,
        createdAt: now,
        updatedAt: now,
      } as StudentState["documents"][number] & { createdAt: string; updatedAt: string };

      commitStudentState((prev) => ({
        ...prev,
        documents: [doc, ...prev.documents],
      }));

      return doc.id;
    },
    [commitStudentState],
  );

  const updateDocument = useCallback(
    (id: string, data: Partial<Pick<Document, "title" | "content">>) => {
      commitStudentState((prev) => ({
        ...prev,
        documents: prev.documents.map((document) =>
          document.id === id ? { ...document, ...data, updatedAt: new Date().toISOString() } : document,
        ),
      }));
    },
    [commitStudentState],
  );

  const deleteDocument = useCallback(
    (id: string) => {
      commitStudentState((prev) => ({
        ...prev,
        documents: prev.documents.filter((document) => document.id !== id),
      }));
    },
    [commitStudentState],
  );

  const updateProfile = useCallback(
    (data: Partial<StudentProfile>) => {
      commitStudentState((prev) => ({
        ...prev,
        profile: {
          ...prev.profile,
          ...data,
        },
      }));
    },
    [commitStudentState],
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

      commitStudentState((prev) => {
        const existing = prev.grades.find(
          (grade) => grade.subject.toLowerCase() === data.subject.toLowerCase(),
        );
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

        return {
          ...prev,
          grades: existing
            ? prev.grades.map((grade) =>
                grade.subject.toLowerCase() === data.subject.toLowerCase() ? nextGrade : grade,
              )
            : [...prev.grades, nextGrade],
        };
      });
    },
    [commitStudentState],
  );

  const addStudySession = useCallback(
    (data: Omit<StudySession, "id" | "createdAt">) => {
      commitStudentState((prev) => ({
        ...prev,
        studySessions: [
          {
            ...data,
            id: generateId(),
            createdAt: new Date().toISOString(),
          },
          ...prev.studySessions,
        ],
      }));
    },
    [commitStudentState],
  );

  const addReflection = useCallback(
    (data: Omit<ReflectionEntry, "id" | "createdAt">) => {
      commitStudentState((prev) => ({
        ...prev,
        reflections: [
          {
            ...data,
            id: generateId(),
            createdAt: new Date().toISOString(),
          },
          ...prev.reflections,
        ],
      }));
    },
    [commitStudentState],
  );

  const addGoal = useCallback(
    (data: Omit<AcademicGoal, "id" | "progress" | "createdAt" | "updatedAt"> & { progress?: number }) => {
      const now = new Date().toISOString();

      commitStudentState((prev) => ({
        ...prev,
        goals: [
          {
            ...data,
            id: generateId(),
            progress: data.progress ?? 0,
            createdAt: now,
            updatedAt: now,
          },
          ...prev.goals,
        ],
      }));
    },
    [commitStudentState],
  );

  const updateGoal = useCallback(
    (id: string, data: Partial<Omit<AcademicGoal, "id">>) => {
      commitStudentState((prev) => ({
        ...prev,
        goals: prev.goals.map((goal) =>
          goal.id === id ? { ...goal, ...data, updatedAt: new Date().toISOString() } : goal,
        ),
      }));
    },
    [commitStudentState],
  );

  const deleteGradeEntry = useCallback(
    (subject: string, entryId: string) => {
      commitStudentState((prev) => {
        const nextGrades = prev.grades
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
          .filter((grade): grade is Grade => grade !== null);

        return {
          ...prev,
          grades: nextGrades,
        };
      });
    },
    [commitStudentState],
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
      // Best effort. Clear the client copy regardless.
    }

    setStudentState(defaultStudentState);
    setPomodoro({ ...DEFAULT_POMODORO });
  }, [setPomodoro]);

  const updateSettings = useCallback(
    (data: Partial<AppSettings>) => {
      commitStudentState((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          ...data,
        },
      }));
    },
    [commitStudentState],
  );

  const updateStatus = useCallback(
    async (data: Partial<StudentState["status"]>) => {
      const response = await fetch("/api/academic/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to update mission health.");
      }

      await refreshStudentState();
      queueMissionRefresh("Mission health changed");
    },
    [queueMissionRefresh, refreshStudentState],
  );

  const setDailyMissionPlan = useCallback(
    async (value: DailyMissionPlan | null) => {
      let nextState: StudentState | null = null;

      setStudentState((current) => {
        nextState = {
          ...current,
          dailyMissionPlan: value,
        };

        return nextState;
      });

      if (loadedRef.current && nextState) {
        const persisted = await persistStudentState(nextState);
        setStudentState(persisted);
        queueMissionRefresh("Student data changed");
      }
    },
    [queueMissionRefresh],
  );

  const normalizedProfile = useMemo(() => normalizeProfile(studentState.profile), [studentState.profile]);
  const documentList = useMemo<Document[]>(
    () =>
      studentState.documents.map((document) => {
        const doc = document as SchoolDocument & { createdAt?: string; updatedAt?: string };

        return {
          id: doc.id,
          title: doc.title,
          content: doc.content,
          createdAt: doc.uploadedAt || doc.createdAt || doc.updatedAt || new Date().toISOString(),
          updatedAt: doc.updatedAt || doc.uploadedAt || doc.createdAt || new Date().toISOString(),
        };
      }),
    [studentState.documents],
  );

  const courses = useMemo(
    () =>
      deriveCourses({
        profile: normalizedProfile,
        assignments: studentState.assignments,
        documents: studentState.documents,
        grades: studentState.grades,
        studySessions: studentState.studySessions,
      }),
    [normalizedProfile, studentState.assignments, studentState.documents, studentState.grades, studentState.studySessions],
  );

  const memory = useMemo(
    () =>
      deriveMemorySnapshot({
        profile: normalizedProfile,
        grades: studentState.grades,
        assignments: studentState.assignments,
        studySessions: studentState.studySessions,
        reflections: studentState.reflections,
      }),
    [normalizedProfile, studentState.assignments, studentState.grades, studentState.reflections, studentState.studySessions],
  );

  const notifications = useMemo(
    () =>
      deriveNotifications({
        assignments: studentState.assignments,
        grades: studentState.grades,
        documents: studentState.documents,
        studySessions: studentState.studySessions,
      }),
    [studentState.assignments, studentState.documents, studentState.grades, studentState.studySessions],
  );

  const recentActivity = useMemo((): ActivityItem[] => {
    const assignmentActivity: ActivityItem[] = studentState.assignments.map((assignment) => ({
      id: `a-${assignment.id}`,
      action: assignment.completed ? "Completed" : "Updated",
      item: assignment.title,
      timestamp: assignment.updatedAt,
    }));
    const documentActivity: ActivityItem[] = documentList.map((document) => ({
      id: `d-${document.id}`,
      action: "Edited",
      item: document.title,
      timestamp: document.updatedAt,
    }));
    const gradeActivity: ActivityItem[] = studentState.grades.flatMap((grade) =>
      grade.entries.map((entry) => ({
        id: `g-${entry.id}`,
        action: "Graded",
        item: `${grade.subject}: ${entry.assignmentName}`,
        timestamp: entry.date,
      })),
    );
    const sessionActivity: ActivityItem[] = studentState.studySessions.map((session) => ({
      id: `s-${session.id}`,
      action: "Studied",
      item: `${session.subject} for ${session.durationMinutes}m`,
      timestamp: session.createdAt,
    }));
    const reflectionActivity: ActivityItem[] = studentState.reflections.map((reflection) => ({
      id: `r-${reflection.id}`,
      action: "Reflected",
      item: reflection.prompt,
      timestamp: reflection.createdAt,
    }));
    const goalActivity: ActivityItem[] = studentState.goals.map((goal) => ({
      id: `goal-${goal.id}`,
      action: "Tracked goal",
      item: goal.title,
      timestamp: goal.updatedAt || goal.createdAt,
    }));

    return [
      ...assignmentActivity,
      ...documentActivity,
      ...gradeActivity,
      ...sessionActivity,
      ...reflectionActivity,
      ...goalActivity,
    ]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 8);
  }, [documentList, studentState.assignments, studentState.grades, studentState.goals, studentState.reflections, studentState.studySessions]);

  const value: AppContextValue = {
    isLoaded: isLoaded && pomodoroLoaded,
    assignments: studentState.assignments,
    documents: documentList,
    profile: normalizedProfile,
    courses,
    grades: studentState.grades,
    memory,
    studySessions: studentState.studySessions,
    reflections: studentState.reflections,
    goals: studentState.goals,
    notifications,
    settings: studentState.settings,
    status: studentState.status,
    pomodoro,
    dailyMissionPlan: studentState.dailyMissionPlan,
    currentMission: studentState.currentMission,
    tutorMessages: studentState.tutorMessages,
    analyticsInsight: studentState.analyticsInsight,
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
    updateStatus,
    setPomodoro,
    setDailyMissionPlan,
    deleteGradeEntry,
    resetAllData,
    recentActivity,
    refreshState: refreshStudentState,
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
