import { readStudentState, writeStudentState } from "./state-repository";
import { StudentState } from "./student-state";

export async function getState(): Promise<StudentState> {
  return readStudentState();
}

export async function updateState(updater: (state: StudentState) => StudentState | Promise<StudentState>) {
  const current = await readStudentState();
  const updated = await updater(current);
  await writeStudentState(updated);
  return updated;
}
