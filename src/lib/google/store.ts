import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { decryptSecret, encryptSecret } from "@/lib/token-vault";

export type GoogleCalendarTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  grantedScopes: string[];
  accountEmail?: string;
  providerAccountId?: string;
  idToken?: string;
  lastRefreshedAt?: string;
};

export type GoogleOAuthStateRecord = {
  stateHash: string;
  createdAt: string;
};

export type GoogleCalendarLinkRecord = {
  localEventId: string;
  localSignature: string;
  googleEventId: string;
  syncedAt: string;
  lastGoogleUpdatedAt?: string;
};

export type GoogleCalendarConnectionRecord = {
  connected: boolean;
  accountEmail?: string;
  grantedScopes: string[];
  lastSyncAt: string | null;
  tokenExpiresAt: string | null;
  latestError: string | null;
  providerAccountId?: string;
};

type GoogleCalendarStore = {
  oauthStates?: GoogleOAuthStateRecord[];
  oauthState?: GoogleOAuthStateRecord | null;
  encryptedTokens?: string | null;
  connection?: GoogleCalendarConnectionRecord | null;
  links?: GoogleCalendarLinkRecord[];
};

const DATA_DIR = path.join(process.cwd(), ".academic-os");
const STORE_FILE = path.join(DATA_DIR, "google-calendar.json");

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readStore(): GoogleCalendarStore {
  ensureDataDir();

  if (!existsSync(STORE_FILE)) {
    return { links: [] };
  }

  try {
    const raw = readFileSync(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw) as GoogleCalendarStore;
    const oauthStates = Array.isArray(parsed.oauthStates)
      ? parsed.oauthStates
      : parsed.oauthState
        ? [parsed.oauthState]
        : [];
    return {
      oauthStates,
      oauthState: oauthStates.at(-1) || null,
      encryptedTokens: parsed.encryptedTokens || null,
      connection: parsed.connection || null,
      links: Array.isArray(parsed.links) ? parsed.links : [],
    };
  } catch {
    return { oauthStates: [], links: [] };
  }
}

function writeStore(store: GoogleCalendarStore) {
  ensureDataDir();
  writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

export function readGoogleCalendarStore() {
  return readStore();
}

export function writeGoogleCalendarStore(store: GoogleCalendarStore) {
  const oauthStates = Array.isArray(store.oauthStates)
    ? store.oauthStates
    : store.oauthState
      ? [store.oauthState]
      : [];

  writeStore({
    oauthStates,
    oauthState: oauthStates.at(-1) || null,
    encryptedTokens: store.encryptedTokens || null,
    connection: store.connection || null,
    links: store.links || [],
  });
}

export function hashOAuthState(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function setGoogleOAuthState(stateValue: string) {
  const next = readStore();
  const oauthStates = [...(next.oauthStates || [])];
  oauthStates.push({
    stateHash: hashOAuthState(stateValue),
    createdAt: new Date().toISOString(),
  });
  writeStore({
    ...next,
    oauthStates: oauthStates.slice(-10),
    oauthState: oauthStates.at(-1) || null,
  });
}

export function validateGoogleOAuthState(stateValue: string) {
  const current = readStore().oauthStates || [];
  const hash = hashOAuthState(stateValue);
  return current.some((item) => item.stateHash === hash);
}

export function clearGoogleOAuthState(stateValue?: string) {
  const next = readStore();
  const remaining = stateValue
    ? (next.oauthStates || []).filter((item) => item.stateHash !== hashOAuthState(stateValue))
    : [];

  writeStore({
    ...next,
    oauthStates: remaining,
    oauthState: remaining.at(-1) || null,
  });
}

export function saveGoogleCalendarTokens(tokens: GoogleCalendarTokens) {
  const next = readStore();
  writeStore({
    ...next,
    encryptedTokens: encryptSecret(JSON.stringify(tokens)),
  });
}

export function readGoogleCalendarTokens(): GoogleCalendarTokens | null {
  const store = readStore();
  if (!store.encryptedTokens) return null;

  try {
    return JSON.parse(decryptSecret(store.encryptedTokens)) as GoogleCalendarTokens;
  } catch {
    return null;
  }
}

export function clearGoogleCalendarTokens() {
  const next = readStore();
  writeStore({
    ...next,
    encryptedTokens: null,
  });
}

export function setGoogleCalendarConnection(connection: GoogleCalendarConnectionRecord) {
  const next = readStore();
  writeStore({
    ...next,
    connection,
  });
}

export function readGoogleCalendarConnection() {
  return readStore().connection || null;
}

export function clearGoogleCalendarConnection() {
  const next = readStore();
  writeStore({
    ...next,
    connection: null,
  });
}

export function readGoogleCalendarLinks() {
  return readStore().links || [];
}

export function upsertGoogleCalendarLink(link: GoogleCalendarLinkRecord) {
  const next = readStore();
  const links = next.links || [];
  const filtered = links.filter(
    (item) =>
      item.localEventId !== link.localEventId &&
      item.googleEventId !== link.googleEventId &&
      item.localSignature !== link.localSignature
  );

  writeStore({
    ...next,
    links: [...filtered, link],
  });
}

export function removeGoogleCalendarLinkByLocalEventId(localEventId: string) {
  const next = readStore();
  writeStore({
    ...next,
    links: (next.links || []).filter((item) => item.localEventId !== localEventId),
  });
}

export function removeGoogleCalendarLinkByGoogleEventId(googleEventId: string) {
  const next = readStore();
  writeStore({
    ...next,
    links: (next.links || []).filter((item) => item.googleEventId !== googleEventId),
  });
}

export function clearGoogleCalendarLinks() {
  const next = readStore();
  writeStore({
    ...next,
    links: [],
  });
}

export function clearGoogleCalendarStore() {
  ensureDataDir();
  if (existsSync(STORE_FILE)) {
    unlinkSync(STORE_FILE);
  }
}
