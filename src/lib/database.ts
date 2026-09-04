import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { Redis } from "@upstash/redis";

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
const REDIS_STATE_KEY = "academic-os:student-state";
const REDIS_EVENTS_KEY = "academic-os:domain-events";

function shouldUseRedisPersistence() {
  return process.env.VERCEL === "1" || process.env.ACADEMICOS_USE_REDIS === "true";
}

function getRedis() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error("AcademicOS production persistence is unavailable. Configure KV_REST_API_URL and KV_REST_API_TOKEN.");
  }
  return new Redis({ url, token });
}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function normalizeState(state: StudentState) {
  return mergeWithDefaultState(state);
}

function toDatabase(state: StudentState, events: DomainEventRecord[] = []): AcademicDatabase {
  return { schemaVersion: 1, updatedAt: new Date().toISOString(), state: normalizeState(state), events };
}

function readLegacyState(): StudentState | null {
  if (!existsSync(LEGACY_STATE_FILE)) return null;
  try {
    return mergeWithDefaultState(JSON.parse(readFileSync(LEGACY_STATE_FILE, "utf8")) as Partial<StudentState>);
  } catch {
    return null;
  }
}

function writeFileDatabase(database: AcademicDatabase) {
  ensureDataDir();
  const normalized = toDatabase(database.state, database.events);
  writeFileSync(DATABASE_FILE, JSON.stringify(normalized, null, 2));
  writeFileSync(LEGACY_STATE_FILE, JSON.stringify(normalized.state, null, 2));
}

function readFileDatabase(): AcademicDatabase {
  ensureDataDir();
  if (!existsSync(DATABASE_FILE)) {
    const database = toDatabase(readLegacyState() || defaultStudentState);
    writeFileDatabase(database);
    return database;
  }
  try {
    const parsed = JSON.parse(readFileSync(DATABASE_FILE, "utf8")) as Partial<AcademicDatabase>;
    return {
      schemaVersion: 1,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      state: normalizeState(mergeWithDefaultState(parsed.state || (parsed as Partial<StudentState>))),
      events: Array.isArray(parsed.events) ? parsed.events : [],
    };
  } catch {
    const database = toDatabase(readLegacyState() || defaultStudentState);
    writeFileDatabase(database);
    return database;
  }
}

export async function readDatabase(): Promise<AcademicDatabase> {
  if (!shouldUseRedisPersistence()) return readFileDatabase();
  const redis = getRedis();
  const [storedState, storedEvents] = await Promise.all([
    redis.get<StudentState>(REDIS_STATE_KEY),
    redis.get<DomainEventRecord[]>(REDIS_EVENTS_KEY),
  ]);
  if (!storedState) {
    const database = toDatabase(defaultStudentState);
    await writeDatabase(database);
    return database;
  }
  return toDatabase(storedState, Array.isArray(storedEvents) ? storedEvents : []);
}

export async function writeDatabase(database: AcademicDatabase) {
  const normalized = toDatabase(database.state, database.events);
  if (!shouldUseRedisPersistence()) {
    writeFileDatabase(normalized);
    return;
  }
  const redis = getRedis();
  await Promise.all([
    redis.set(REDIS_STATE_KEY, normalized.state),
    redis.set(REDIS_EVENTS_KEY, normalized.events.slice(-500)),
  ]);
}

export async function readStateSnapshot(): Promise<StudentState> {
  return (await readDatabase()).state;
}

export async function writeStateSnapshot(state: StudentState) {
  const current = await readDatabase();
  await writeDatabase({ ...current, state });
}

export async function updateDatabase(updater: (database: AcademicDatabase) => AcademicDatabase): Promise<AcademicDatabase> {
  const next = updater(await readDatabase());
  await writeDatabase(next);
  return next;
}

export async function appendDomainEvent(event: DomainEventRecord) {
  if (shouldUseRedisPersistence()) {
    const redis = getRedis();
    const events = (await redis.get<DomainEventRecord[]>(REDIS_EVENTS_KEY)) || [];
    await redis.set(REDIS_EVENTS_KEY, [...events, event].slice(-500));
    return;
  }
  await updateDatabase((database) => ({ ...database, events: [...database.events, event].slice(-500) }));
}
