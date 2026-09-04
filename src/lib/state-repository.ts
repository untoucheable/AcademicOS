import { readStateSnapshot, writeStateSnapshot } from "./database";
import { StudentState } from "./student-state";

export async function readStudentState(): Promise<StudentState> {
  return readStateSnapshot();
}

export async function writeStudentState(state: StudentState) {
  await writeStateSnapshot(state);
}
