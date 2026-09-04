import { defaultStudentState, mergeWithDefaultState } from "./default-state";
import { StudentState } from "./student-state";

const STORAGE_KEY = "academic-os-state";

export function loadState(): StudentState {
  if (typeof window === "undefined") return defaultStudentState;

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultStudentState;

  try {
    return mergeWithDefaultState(JSON.parse(raw) as Partial<StudentState>);
  } catch {
    return defaultStudentState;
  }
}

export function saveState(state: StudentState) {
  if (typeof window === "undefined") return;

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function updateState(updater: (state: StudentState) => StudentState) {
  const current = loadState();
  const updated = updater(current);
  saveState(updated);
  return updated;
}

export function getState(): StudentState {
  return loadState();
}
