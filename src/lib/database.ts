import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { defaultStudentState, mergeWithDefaultState } from "./default-state";
import { StudentState } from "./student-state";

export type DomainEventRecord = {
  id: string;
  type: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};

export type AcademicDatabase = {
  schemaVersion: 1;
  updatedAt: string;
  state: StudentState;
  events: DomainEventRecord[];
};

const DATA_DIR = path.join(process.cwd(), ".academic-os");
const DATABASE_FILE = path.join(DATA_DIR, "database.json");
const LEGACY_STATE_FILE = path.join(DATA_DIR, "student-state.json");

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function toDatabase(state: StudentState, events: DomainEventRecord[] = []): AcademicDatabase {
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    state,
    events,
  };
}

function readLegacyState(): StudentState | null {
  if (!existsSync(LEGACY_STATE_FILE)) return null;

  try {
    const raw = readFileSync(LEGACY_STATE_FILE, "utf8");
    return mergeWithDefaultState(JSON.parse(raw) as Partial<StudentState>);
  } catch {
    return null;
  }
}

export function readDatabase(): AcademicDatabase {
  ensureDataDir();

  if (!existsSync(DATABASE_FILE)) {
    const legacy = readLegacyState() || defaultStudentState;
    const database = toDatabase(legacy);
    writeDatabase(database);
    return database;
  }

  try {
    const raw = readFileSync(DATABASE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<AcademicDatabase>;

    return {
      schemaVersion: 1,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      state: mergeWithDefaultState(parsed.state || (parsed as Partial<StudentState>)),
      events: Array.isArray(parsed.events) ? parsed.events : [],
    };
  } catch {
    const legacy = readLegacyState() || defaultStudentState;
    const database = toDatabase(legacy);
    writeDatabase(database);
    return database;
  }
}

export function writeDatabase(database: AcademicDatabase) {
  ensureDataDir();
  const serialized = JSON.stringify(
    {
      ...database,
      updatedAt: new Date().toISOString(),
    },
    null,
    2,
  );
  writeFileSync(DATABASE_FILE, serialized);
  writeFileSync(LEGACY_STATE_FILE, JSON.stringify(database.state, null, 2));
}

export function readStateSnapshot(): StudentState {
  return readDatabase().state;
}

export function writeStateSnapshot(state: StudentState) {
  const current = readDatabase();
  writeDatabase({
    ...current,
    state,
  });
}

export function updateDatabase(
  updater: (database: AcademicDatabase) => AcademicDatabase,
): AcademicDatabase {
  const next = updater(readDatabase());
  writeDatabase(next);
  return next;
}

export function appendDomainEvent(event: DomainEventRecord) {
  updateDatabase((database) => ({
    ...database,
    events: [...database.events, event].slice(-500),
  }));
}

