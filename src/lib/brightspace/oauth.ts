import crypto from "node:crypto";

import { type BrightspaceConfig } from "./config";
import {
  clearBrightspaceConnection,
  clearBrightspaceOAuthState,
  clearBrightspaceTokens,
  readBrightspaceConnection,
  readBrightspaceTokens,
  saveBrightspaceTokens,
  setBrightspaceConnection,
  type BrightspaceTokens,
} from "./store";

type OAuthTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

type BrightspaceUserInfo = {
  email?: string;
  name?: string;
  user_id?: string;
  sub?: string;
};

function formBody(params: Record<string, string>) {
  return new URLSearchParams(params).toString();
}

function isExpired(expiresAt?: string | null) {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() <= Date.now() + 60_000;
}

async function exchangeCode(config: BrightspaceConfig, code: string) {
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
    },
    body: formBody({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as OAuthTokenResponse & { error?: string; error_description?: string };
  if (!response.ok) {
    throw new Error(data.error_description || data.error || "Brightspace token exchange failed.");
  }
  return data;
}

async function refreshToken(config: BrightspaceConfig, refreshTokenValue: string) {
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
    },
    body: formBody({
      grant_type: "refresh_token",
      refresh_token: refreshTokenValue,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as OAuthTokenResponse & { error?: string; error_description?: string };
  if (!response.ok) {
    throw new Error(data.error_description || data.error || "Brightspace token refresh failed.");
  }
  return data;
}

async function fetchUserInfo(config: BrightspaceConfig, accessToken: string): Promise<BrightspaceUserInfo> {
  const response = await fetch(`${config.apiBase.replace(/\/$/, "")}${config.userInfoPath}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  const data = (await response.json().catch(() => ({}))) as BrightspaceUserInfo & { error?: unknown };
  if (!response.ok) {
    throw new Error("Brightspace user lookup failed.");
  }
  return data;
}

export function createBrightspaceOAuthState() {
  return crypto.randomBytes(32).toString("hex");
}

export function buildBrightspaceAuthorizationUrl(config: BrightspaceConfig, state: string) {
  const url = new URL(config.authUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("state", state);
  return url;
}

export async function connectBrightspaceAccount(config: BrightspaceConfig, code: string) {
  const exchanged = await exchangeCode(config, code);
  if (!exchanged.access_token) {
    throw new Error("Brightspace did not return an access token.");
  }

  const userInfo = await fetchUserInfo(config, exchanged.access_token);
  if (!exchanged.refresh_token) {
    throw new Error("Brightspace did not return a refresh token.");
  }

  const tokens: BrightspaceTokens = {
    accessToken: exchanged.access_token,
    refreshToken: exchanged.refresh_token,
    expiresAt: new Date(Date.now() + Math.max(0, exchanged.expires_in || 0) * 1000).toISOString(),
    grantedScopes: (exchanged.scope || config.scopes.join(" ")).split(" ").filter(Boolean),
    accountEmail: userInfo.email,
    accountName: userInfo.name,
    providerAccountId: userInfo.user_id || userInfo.sub,
    lastRefreshedAt: new Date().toISOString(),
  };

  saveBrightspaceTokens(tokens);
  setBrightspaceConnection({
    connected: true,
    accountEmail: tokens.accountEmail,
    accountName: tokens.accountName,
    grantedScopes: tokens.grantedScopes,
    lastSyncAt: readBrightspaceConnection()?.lastSyncAt || null,
    tokenExpiresAt: tokens.expiresAt,
    latestError: null,
    providerAccountId: tokens.providerAccountId,
  });

  return { tokens, userInfo };
}

export async function ensureFreshBrightspaceTokens(config: BrightspaceConfig) {
  const tokens = readBrightspaceTokens();
  if (!tokens) {
    throw new Error("Brightspace is not connected.");
  }

  if (!isExpired(tokens.expiresAt)) {
    return tokens;
  }

  const refreshed = await refreshToken(config, tokens.refreshToken);
  const nextTokens: BrightspaceTokens = {
    ...tokens,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token || tokens.refreshToken,
    expiresAt: new Date(Date.now() + Math.max(0, refreshed.expires_in || 0) * 1000).toISOString(),
    grantedScopes: (refreshed.scope || tokens.grantedScopes.join(" ")).split(" ").filter(Boolean),
    lastRefreshedAt: new Date().toISOString(),
  };

  saveBrightspaceTokens(nextTokens);
  setBrightspaceConnection({
    ...(readBrightspaceConnection() || {
      connected: true,
      grantedScopes: [],
      lastSyncAt: null,
      tokenExpiresAt: null,
      latestError: null,
    }),
    connected: true,
    accountEmail: nextTokens.accountEmail,
    accountName: nextTokens.accountName,
    grantedScopes: nextTokens.grantedScopes,
    tokenExpiresAt: nextTokens.expiresAt,
    latestError: null,
    providerAccountId: nextTokens.providerAccountId,
  });

  return nextTokens;
}

export function getBrightspaceConnection() {
  return readBrightspaceConnection();
}

export function getBrightspaceTokenExpiryStatus() {
  const tokens = readBrightspaceTokens();
  if (!tokens) return "disconnected";
  if (isExpired(tokens.expiresAt)) return "expired";
  const expiresInMinutes = Math.round((new Date(tokens.expiresAt).getTime() - Date.now()) / 60000);
  if (expiresInMinutes <= 10) return "expiring-soon";
  return "valid";
}

export function markBrightspaceConnectionError(error: string) {
  const connection = readBrightspaceConnection();
  setBrightspaceConnection({
    connected: Boolean(connection?.connected),
    accountEmail: connection?.accountEmail,
    accountName: connection?.accountName,
    grantedScopes: connection?.grantedScopes || [],
    lastSyncAt: connection?.lastSyncAt || null,
    tokenExpiresAt: connection?.tokenExpiresAt || null,
    latestError: error,
    providerAccountId: connection?.providerAccountId,
  });
}

export async function disconnectBrightspaceAccount() {
  clearBrightspaceTokens();
  clearBrightspaceConnection();
  clearBrightspaceOAuthState();

  return {
    disconnected: true,
  };
}

export function clearBrightspaceAccount() {
  clearBrightspaceTokens();
  clearBrightspaceConnection();
  clearBrightspaceOAuthState();
}
