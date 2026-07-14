import { readStudentState, writeStudentState } from "./state-repository";
import { StudentState } from "./student-state";

export function getState() {
  return readStudentState();
}

export function updateState(updater: (state: StudentState) => StudentState) {
  const current = readStudentState();
  const updated = updater(current);
  writeStudentState(updated);
  return updated;
}
