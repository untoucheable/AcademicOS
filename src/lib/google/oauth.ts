import crypto from "node:crypto";

import {
  GOOGLE_AUTH_BASE_URL,
  GOOGLE_CALENDAR_SCOPES,
  type GoogleCalendarConfig,
} from "./config";
import {
  clearGoogleCalendarConnection,
  clearGoogleCalendarLinks,
  clearGoogleCalendarTokens,
  readGoogleCalendarConnection,
  readGoogleCalendarLinks,
  readGoogleCalendarTokens,
  saveGoogleCalendarTokens,
  setGoogleCalendarConnection,
  type GoogleCalendarConnectionRecord,
  type GoogleCalendarTokens,
} from "./store";
import {
  deleteGoogleCalendarEvent,
  exchangeGoogleAuthorizationCode,
  fetchGoogleUserInfo,
  refreshGoogleAccessToken,
  revokeGoogleToken,
} from "./calendar";

export function createGoogleOAuthState() {
  return crypto.randomBytes(32).toString("hex");
}

export function buildGoogleAuthorizationUrl(config: GoogleCalendarConfig, state: string) {
  const url = new URL(GOOGLE_AUTH_BASE_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url;
}

function isExpired(expiresAt?: string | null) {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() <= Date.now() + 60_000;
}

async function toConnectionRecord(
  tokens: GoogleCalendarTokens,
  latestError: string | null = null,
): Promise<GoogleCalendarConnectionRecord> {
  return {
    connected: true,
    accountEmail: tokens.accountEmail,
    grantedScopes: tokens.grantedScopes,
    lastSyncAt: (await readGoogleCalendarConnection())?.lastSyncAt || null,
    tokenExpiresAt: tokens.expiresAt,
    latestError,
    providerAccountId: tokens.providerAccountId,
  };
}

export async function connectGoogleCalendarAccount(
  config: GoogleCalendarConfig,
  code: string,
) {
  const exchanged = await exchangeGoogleAuthorizationCode(config, code);
  const userInfo = await fetchGoogleUserInfo(exchanged.access_token);
  if (!exchanged.refresh_token) {
    throw new Error("Google did not return a refresh token.");
  }
  const tokens: GoogleCalendarTokens = {
    accessToken: exchanged.access_token,
    refreshToken: exchanged.refresh_token,
    expiresAt: new Date(Date.now() + Math.max(0, exchanged.expires_in || 0) * 1000).toISOString(),
    grantedScopes: (exchanged.scope || GOOGLE_CALENDAR_SCOPES.join(" ")).split(" ").filter(Boolean),
    accountEmail: userInfo.email,
    providerAccountId: userInfo.id,
    idToken: exchanged.id_token,
    lastRefreshedAt: new Date().toISOString(),
  };

  await saveGoogleCalendarTokens(tokens);
  await setGoogleCalendarConnection(await toConnectionRecord(tokens));

  return { tokens, userInfo };
}

export async function ensureFreshGoogleCalendarTokens(config: GoogleCalendarConfig) {
  const tokens = await readGoogleCalendarTokens();
  if (!tokens) {
    throw new Error("Google Calendar is not connected.");
  }

  if (!isExpired(tokens.expiresAt)) {
    return tokens;
  }

  if (!tokens.refreshToken) {
    throw new Error("Google Calendar refresh token is missing.");
  }

  const refreshed = await refreshGoogleAccessToken(config, tokens.refreshToken);
  const nextTokens: GoogleCalendarTokens = {
    ...tokens,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token || tokens.refreshToken,
    expiresAt: new Date(Date.now() + Math.max(0, refreshed.expires_in || 0) * 1000).toISOString(),
    grantedScopes: (refreshed.scope || tokens.grantedScopes.join(" ")).split(" ").filter(Boolean),
    idToken: refreshed.id_token || tokens.idToken,
    lastRefreshedAt: new Date().toISOString(),
  };

  await saveGoogleCalendarTokens(nextTokens);
  await setGoogleCalendarConnection({
    ...((await readGoogleCalendarConnection()) || await toConnectionRecord(nextTokens)),
    connected: true,
    accountEmail: nextTokens.accountEmail,
    grantedScopes: nextTokens.grantedScopes,
    tokenExpiresAt: nextTokens.expiresAt,
    latestError: null,
    providerAccountId: nextTokens.providerAccountId,
  });

  return nextTokens;
}

export async function getGoogleCalendarConnection() {
  return readGoogleCalendarConnection();
}

export async function markGoogleCalendarConnectionError(error: string) {
  const connection = await readGoogleCalendarConnection();
  await setGoogleCalendarConnection({
    connected: Boolean(connection?.connected),
    accountEmail: connection?.accountEmail,
    grantedScopes: connection?.grantedScopes || [],
    lastSyncAt: connection?.lastSyncAt || null,
    tokenExpiresAt: connection?.tokenExpiresAt || null,
    latestError: error,
    providerAccountId: connection?.providerAccountId,
  });
}

export async function disconnectGoogleCalendarAccount(config: GoogleCalendarConfig) {
  const tokens = await readGoogleCalendarTokens();
  const links = await readGoogleCalendarLinks();

  try {
    if (tokens?.accessToken) {
      for (const link of links) {
        try {
          await deleteGoogleCalendarEvent(tokens.accessToken, link.googleEventId);
        } catch {
          // Best effort cleanup of AcademicOS-owned Google Calendar events.
        }
      }
    }

    if (tokens?.refreshToken) {
      await revokeGoogleToken(tokens.refreshToken);
    } else if (tokens?.accessToken) {
      await revokeGoogleToken(tokens.accessToken);
    }
  } catch {
    // Best effort revocation. We still clean up local state.
  }

  await clearGoogleCalendarTokens();
  await clearGoogleCalendarLinks();
  await clearGoogleCalendarConnection();

  await setGoogleCalendarConnection({
    connected: false,
    grantedScopes: [],
    lastSyncAt: null,
    tokenExpiresAt: null,
    latestError: null,
  });

  return {
    disconnected: true,
    redirectUri: config.redirectUri,
  };
}

export async function getGoogleCalendarTokenExpiryStatus() {
  const tokens = await readGoogleCalendarTokens();
  if (!tokens) return "disconnected";
  if (isExpired(tokens.expiresAt)) return "expired";
  const expiresInMinutes = Math.round((new Date(tokens.expiresAt).getTime() - Date.now()) / 60000);
  if (expiresInMinutes <= 10) return "expiring-soon";
  return "valid";
}

export function getGoogleCalendarAccessTokenOrThrow(config: GoogleCalendarConfig) {
  return ensureFreshGoogleCalendarTokens(config).then((tokens) => tokens.accessToken);
}
