export type GoogleCalendarConfig = {
  projectId: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  encryptionSecret: string;
  defaultTimezone: string;
};

export const GOOGLE_CALENDAR_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events",
];

export const GOOGLE_AUTH_BASE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
export const GOOGLE_CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

export function requireGoogleCalendarConfig(): GoogleCalendarConfig {
  const redirectUri = getRequiredEnv("ACADEMIC_OS_GOOGLE_REDIRECT_URI");

  try {
    new URL(redirectUri);
  } catch {
    throw new Error("ACADEMIC_OS_GOOGLE_REDIRECT_URI must be a valid URL.");
  }

  return {
    projectId: getRequiredEnv("ACADEMIC_OS_GOOGLE_PROJECT_ID"),
    clientId: getRequiredEnv("ACADEMIC_OS_GOOGLE_CLIENT_ID"),
    clientSecret: getRequiredEnv("ACADEMIC_OS_GOOGLE_CLIENT_SECRET"),
    redirectUri,
    encryptionSecret: getRequiredEnv("ACADEMIC_OS_ENCRYPTION_SECRET"),
    defaultTimezone: getRequiredEnv("ACADEMIC_OS_DEFAULT_TIMEZONE"),
  };
}
