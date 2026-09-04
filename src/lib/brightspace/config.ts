export type BrightspaceConfig = {
  baseUrl: string;
  authUrl: string;
  tokenUrl: string;
  apiBase: string;
  userInfoPath: string;
  enrollmentsPath: string;
  newsPathTemplate: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  encryptionSecret: string;
  scopes: string[];
};

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

function splitScopes(value: string) {
  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function requireBrightspaceConfig(): BrightspaceConfig {
  const redirectUri =
    process.env.ACADEMIC_OS_BRIGHTSPACE_REDIRECT_URI?.trim() ||
    new URL(
      "/api/integrations/brightspace/oauth/callback",
      process.env.ACADEMIC_OS_APP_URL?.trim() || "http://localhost:3000",
    ).toString();
  const authUrl = getRequiredEnv("ACADEMIC_OS_BRIGHTSPACE_AUTH_URL");
  const tokenUrl = getRequiredEnv("ACADEMIC_OS_BRIGHTSPACE_TOKEN_URL");
  const baseUrl = getRequiredEnv("ACADEMIC_OS_BRIGHTSPACE_BASE_URL");
  const apiBase = process.env.ACADEMIC_OS_BRIGHTSPACE_API_BASE?.trim() || baseUrl;
  const scopes = splitScopes(getRequiredEnv("ACADEMIC_OS_BRIGHTSPACE_SCOPES"));
  const userInfoPath = process.env.ACADEMIC_OS_BRIGHTSPACE_USERINFO_PATH?.trim() || "/lp/1.46/users/whoami";
  const enrollmentsPath = process.env.ACADEMIC_OS_BRIGHTSPACE_ENROLLMENTS_PATH?.trim() || "/lp/1.46/enrollments/myenrollments/";
  const newsPathTemplate = process.env.ACADEMIC_OS_BRIGHTSPACE_NEWS_PATH_TEMPLATE?.trim() || "/le/1.75/{orgUnitId}/news/";

  try {
    new URL(redirectUri);
    new URL(authUrl);
    new URL(tokenUrl);
    new URL(baseUrl);
    new URL(apiBase);
  } catch {
    throw new Error("Brightspace URLs must be valid absolute URLs.");
  }

  return {
    baseUrl,
    authUrl,
    tokenUrl,
    apiBase,
    userInfoPath,
    enrollmentsPath,
    newsPathTemplate,
    clientId: getRequiredEnv("ACADEMIC_OS_BRIGHTSPACE_CLIENT_ID"),
    clientSecret: getRequiredEnv("ACADEMIC_OS_BRIGHTSPACE_CLIENT_SECRET"),
    redirectUri,
    encryptionSecret: getRequiredEnv("ACADEMIC_OS_ENCRYPTION_SECRET"),
    scopes,
  };
}
