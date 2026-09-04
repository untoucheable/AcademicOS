import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { decryptSecret, encryptSecret } from "@/lib/token-vault";

export type BrightspaceTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  grantedScopes: string[];
  accountEmail?: string;
  accountName?: string;
  providerAccountId?: string;
  lastRefreshedAt?: string;
};

export type BrightspaceOAuthStateRecord = {
  stateHash: string;
  createdAt: string;
};

export type BrightspaceConnectionRecord = {
  connected: boolean;
  accountEmail?: string;
  accountName?: string;
  grantedScopes: string[];
  lastSyncAt: string | null;
  tokenExpiresAt: string | null;
  latestError: string | null;
  providerAccountId?: string;
};

type BrightspaceStore = {
  oauthStates?: BrightspaceOAuthStateRecord[];
  oauthState?: BrightspaceOAuthStateRecord | null;
  encryptedTokens?: string | null;
  connection?: BrightspaceConnectionRecord | null;
};

const DATA_DIR = path.join(process.cwd(), ".academic-os");
const STORE_FILE = path.join(DATA_DIR, "brightspace.json");

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readStore(): BrightspaceStore {
  ensureDataDir();

  if (!existsSync(STORE_FILE)) {
    return {};
  }

  try {
    const raw = readFileSync(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw) as BrightspaceStore;
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
    };
  } catch {
    return {};
  }
}

function writeStore(store: BrightspaceStore) {
  ensureDataDir();
  writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

export function hashOAuthState(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function setBrightspaceOAuthState(stateValue: string) {
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

export function validateBrightspaceOAuthState(stateValue: string) {
  const current = readStore().oauthStates || [];
  const hash = hashOAuthState(stateValue);
  return current.some((item) => item.stateHash === hash);
}

export function clearBrightspaceOAuthState(stateValue?: string) {
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

export function saveBrightspaceTokens(tokens: BrightspaceTokens) {
  const next = readStore();
  writeStore({
    ...next,
    encryptedTokens: encryptSecret(JSON.stringify(tokens)),
  });
}

export function readBrightspaceTokens(): BrightspaceTokens | null {
  const store = readStore();
  if (!store.encryptedTokens) return null;

  try {
    return JSON.parse(decryptSecret(store.encryptedTokens)) as BrightspaceTokens;
  } catch {
    return null;
  }
}

export function clearBrightspaceTokens() {
  const next = readStore();
  writeStore({
    ...next,
    encryptedTokens: null,
  });
}

export function setBrightspaceConnection(connection: BrightspaceConnectionRecord) {
  const next = readStore();
  writeStore({
    ...next,
    connection,
  });
}

export function readBrightspaceConnection() {
  return readStore().connection || null;
}

export function clearBrightspaceConnection() {
  const next = readStore();
  writeStore({
    ...next,
    connection: null,
  });
}

export function clearBrightspaceStore() {
  ensureDataDir();
  if (existsSync(STORE_FILE)) {
    unlinkSync(STORE_FILE);
  }
}
