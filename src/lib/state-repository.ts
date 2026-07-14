import { readStateSnapshot, writeStateSnapshot } from "./database";
import { StudentState } from "./student-state";

export function readStudentState(): StudentState {
  return readStateSnapshot();
}

export function writeStudentState(state: StudentState) {
  writeStateSnapshot(state);
}
