"use client";

import { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { DEFAULT_POMODORO, DEFAULT_SETTINGS, STORAGE_KEYS } from "@/lib/storage/keys";
import { generateId } from "@/lib/storage/helpers";
import type {
  ActivityItem,
  AppSettings,
  Assignment,
  Document,
  PomodoroState,
} from "@/lib/types";

type AppContextValue = {
  isLoaded: boolean;
  assignments: Assignment[];
  documents: Document[];
  settings: AppSettings;
  pomodoro: PomodoroState;
  addAssignment: (data: Omit<Assignment, "id" | "createdAt" | "updatedAt" | "completed">) => void;
  updateAssignment: (id: string, data: Partial<Omit<Assignment, "id" | "createdAt">>) => void;
  deleteAssignment: (id: string) => void;
  toggleAssignmentComplete: (id: string) => void;
  addDocument: (title?: string) => string;
  updateDocument: (id: string, data: Partial<Pick<Document, "title" | "content">>) => void;
  deleteDocument: (id: string) => void;
  updateSettings: (data: Partial<AppSettings>) => void;
  setPomodoro: (value: PomodoroState | ((prev: PomodoroState) => PomodoroState)) => void;
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
  const [settings, setSettings, settingsLoaded] = useLocalStorage<AppSettings>(
    STORAGE_KEYS.SETTINGS,
    { ...DEFAULT_SETTINGS },
  );
  const [pomodoro, setPomodoro, pomodoroLoaded] = useLocalStorage<PomodoroState>(
    STORAGE_KEYS.POMODORO,
    { ...DEFAULT_POMODORO },
  );

  const isLoaded = assignmentsLoaded && documentsLoaded && settingsLoaded && pomodoroLoaded;

  useEffect(() => {
    if (!isLoaded) return;
    document.documentElement.classList.toggle("dark", settings.darkMode);
  }, [settings.darkMode, isLoaded]);

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

  const updateSettings = useCallback(
    (data: Partial<AppSettings>) => {
      setSettings((prev) => ({ ...prev, ...data }));
    },
    [setSettings],
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
    return [...assignmentActivity, ...documentActivity]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 8);
  }, [assignments, documents]);

  const value: AppContextValue = {
    isLoaded,
    assignments,
    documents,
    settings,
    pomodoro,
    addAssignment,
    updateAssignment,
    deleteAssignment,
    toggleAssignmentComplete,
    addDocument,
    updateDocument,
    deleteDocument,
    updateSettings,
    setPomodoro,
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
