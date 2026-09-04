import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { Redis } from "@upstash/redis";

import { decryptSecret, encryptSecret } from "@/lib/token-vault";

export type GoogleCalendarTokens = { accessToken: string; refreshToken: string; expiresAt: string; grantedScopes: string[]; accountEmail?: string; providerAccountId?: string; idToken?: string; lastRefreshedAt?: string };
export type GoogleOAuthStateRecord = { stateHash: string; createdAt: string };
export type GoogleCalendarLinkRecord = { localEventId: string; localSignature: string; googleEventId: string; syncedAt: string; lastGoogleUpdatedAt?: string };
export type GoogleCalendarConnectionRecord = { connected: boolean; accountEmail?: string; grantedScopes: string[]; lastSyncAt: string | null; tokenExpiresAt: string | null; latestError: string | null; providerAccountId?: string };

type GoogleCalendarStore = { oauthStates?: GoogleOAuthStateRecord[]; oauthState?: GoogleOAuthStateRecord | null; encryptedTokens?: string | null; connection?: GoogleCalendarConnectionRecord | null; links?: GoogleCalendarLinkRecord[] };

const DATA_DIR = path.join(process.cwd(), ".academic-os");
const STORE_FILE = path.join(DATA_DIR, "google-calendar.json");
const REDIS_KEY = "academic-os:google-calendar-store";

function shouldUseRedisPersistence() { return process.env.VERCEL === "1" || process.env.ACADEMICOS_USE_REDIS === "true"; }
function getRedis() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("AcademicOS production persistence is unavailable. Configure KV_REST_API_URL and KV_REST_API_TOKEN.");
  return new Redis({ url, token });
}
function ensureDataDir() { if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true }); }
function normalizeStore(store: GoogleCalendarStore): GoogleCalendarStore {
  const oauthStates = Array.isArray(store.oauthStates) ? store.oauthStates : store.oauthState ? [store.oauthState] : [];
  return { oauthStates, oauthState: oauthStates.at(-1) || null, encryptedTokens: store.encryptedTokens || null, connection: store.connection || null, links: store.links || [] };
}
function readFileStore(): GoogleCalendarStore {
  ensureDataDir();
  if (!existsSync(STORE_FILE)) return normalizeStore({});
  try { return normalizeStore(JSON.parse(readFileSync(STORE_FILE, "utf8")) as GoogleCalendarStore); } catch { return normalizeStore({}); }
}
async function readStore(): Promise<GoogleCalendarStore> {
  if (!shouldUseRedisPersistence()) return readFileStore();
  return normalizeStore((await getRedis().get<GoogleCalendarStore>(REDIS_KEY)) || {});
}
async function writeStore(store: GoogleCalendarStore) {
  const normalized = normalizeStore(store);
  if (shouldUseRedisPersistence()) { await getRedis().set(REDIS_KEY, normalized); return; }
  ensureDataDir();
  writeFileSync(STORE_FILE, JSON.stringify(normalized, null, 2));
}

export async function readGoogleCalendarStore() { return readStore(); }
export async function writeGoogleCalendarStore(store: GoogleCalendarStore) { await writeStore(store); }
export function hashOAuthState(value: string) { return createHash("sha256").update(value).digest("hex"); }
export async function setGoogleOAuthState(stateValue: string) {
  const next = await readStore();
  const oauthStates = [...(next.oauthStates || []), { stateHash: hashOAuthState(stateValue), createdAt: new Date().toISOString() }].slice(-10);
  await writeStore({ ...next, oauthStates });
}
export async function validateGoogleOAuthState(stateValue: string) { return (await readStore()).oauthStates?.some((item) => item.stateHash === hashOAuthState(stateValue)) || false; }
export async function clearGoogleOAuthState(stateValue?: string) {
  const next = await readStore();
  await writeStore({ ...next, oauthStates: stateValue ? (next.oauthStates || []).filter((item) => item.stateHash !== hashOAuthState(stateValue)) : [] });
}
export async function saveGoogleCalendarTokens(tokens: GoogleCalendarTokens) { const next = await readStore(); await writeStore({ ...next, encryptedTokens: encryptSecret(JSON.stringify(tokens)) }); }
export async function readGoogleCalendarTokens(): Promise<GoogleCalendarTokens | null> {
  const encryptedTokens = (await readStore()).encryptedTokens;
  if (!encryptedTokens) return null;
  try { return JSON.parse(decryptSecret(encryptedTokens)) as GoogleCalendarTokens; } catch { return null; }
}
export async function clearGoogleCalendarTokens() { const next = await readStore(); await writeStore({ ...next, encryptedTokens: null }); }
export async function setGoogleCalendarConnection(connection: GoogleCalendarConnectionRecord) { const next = await readStore(); await writeStore({ ...next, connection }); }
export async function readGoogleCalendarConnection() { return (await readStore()).connection || null; }
export async function clearGoogleCalendarConnection() { const next = await readStore(); await writeStore({ ...next, connection: null }); }
export async function readGoogleCalendarLinks() { return (await readStore()).links || []; }
export async function upsertGoogleCalendarLink(link: GoogleCalendarLinkRecord) {
  const next = await readStore(); const links = (next.links || []).filter((item) => item.localEventId !== link.localEventId && item.googleEventId !== link.googleEventId && item.localSignature !== link.localSignature);
  await writeStore({ ...next, links: [...links, link] });
}
export async function removeGoogleCalendarLinkByLocalEventId(localEventId: string) { const next = await readStore(); await writeStore({ ...next, links: (next.links || []).filter((item) => item.localEventId !== localEventId) }); }
export async function removeGoogleCalendarLinkByGoogleEventId(googleEventId: string) { const next = await readStore(); await writeStore({ ...next, links: (next.links || []).filter((item) => item.googleEventId !== googleEventId) }); }
export async function clearGoogleCalendarLinks() { const next = await readStore(); await writeStore({ ...next, links: [] }); }
export async function clearGoogleCalendarStore() {
  if (shouldUseRedisPersistence()) { await getRedis().del(REDIS_KEY); return; }
  ensureDataDir(); if (existsSync(STORE_FILE)) unlinkSync(STORE_FILE);
}
