import type { CalendarEvent, CalendarEventType } from "@/lib/calendar";
import { calendarEventSignature } from "@/lib/calendar-signature";

import {
  GOOGLE_CALENDAR_API_BASE,
  GOOGLE_REVOKE_URL,
  GOOGLE_TOKEN_URL,
  GOOGLE_USERINFO_URL,
  type GoogleCalendarConfig,
} from "./config";

export type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
  token_type?: string;
};

export type GoogleUserInfo = {
  email?: string;
  id?: string;
  name?: string;
  picture?: string;
};

export type GoogleCalendarExtendedProperties = {
  private?: Record<string, string>;
  shared?: Record<string, string>;
};

export type GoogleCalendarApiEvent = {
  id: string;
  summary?: string;
  description?: string;
  status?: "confirmed" | "tentative" | "cancelled";
  created?: string;
  updated?: string;
  htmlLink?: string;
  eventType?: string;
  start?: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end?: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  extendedProperties?: GoogleCalendarExtendedProperties;
  recurringEventId?: string;
};

type GoogleEventTimeRange = {
  timeMin: string;
  timeMax: string;
};

function buildErrorMessage(response: Response, fallback: string) {
  return response
    .json()
    .catch(() => null)
    .then((data) => {
      if (data && typeof data === "object") {
        const message =
          ("error" in data && data.error && typeof data.error === "object" && "message" in data.error && String(data.error.message)) ||
          ("error_description" in data && data.error_description && String(data.error_description)) ||
          ("message" in data && data.message && String(data.message));
        if (message) return message;
      }
      return fallback;
    });
}

async function fetchJson<T>(url: string, init: RequestInit, fallback: string): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(await buildErrorMessage(response, fallback));
  }
  return response.json() as Promise<T>;
}

async function fetchText(url: string, init: RequestInit, fallback: string) {
  const response = await fetch(url, init);
  if (!response.ok && response.status !== 200 && response.status !== 201 && response.status !== 204) {
    throw new Error(await buildErrorMessage(response, fallback));
  }
}

export async function exchangeGoogleAuthorizationCode(
  config: GoogleCalendarConfig,
  code: string,
) {
  const response = await fetchJson<GoogleTokenResponse>(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  }, "Google authorization code exchange failed.");

  return response;
}

export async function refreshGoogleAccessToken(
  config: GoogleCalendarConfig,
  refreshToken: string,
) {
  const response = await fetchJson<GoogleTokenResponse>(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  }, "Google access token refresh failed.");

  return response;
}

export async function fetchGoogleUserInfo(accessToken: string) {
  return fetchJson<GoogleUserInfo>(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  }, "Google user profile lookup failed.");
}

export async function revokeGoogleToken(token: string) {
  await fetchText(
    `${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    },
    "Google token revocation failed.",
  );
}

export async function listGoogleCalendarEvents(
  accessToken: string,
  range: GoogleEventTimeRange,
) {
  const events: GoogleCalendarApiEvent[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${GOOGLE_CALENDAR_API_BASE}/calendars/primary/events`);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("showDeleted", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("timeMin", range.timeMin);
    url.searchParams.set("timeMax", range.timeMax);
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(await buildErrorMessage(response, "Google Calendar listing failed."));
    }

    const data = (await response.json()) as {
      items?: GoogleCalendarApiEvent[];
      nextPageToken?: string;
    };

    events.push(...(data.items || []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return events;
}

export async function createGoogleCalendarEvent(
  accessToken: string,
  payload: Record<string, unknown>,
) {
  return fetchJson<GoogleCalendarApiEvent>(`${GOOGLE_CALENDAR_API_BASE}/calendars/primary/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }, "Google Calendar event creation failed.");
}

export async function updateGoogleCalendarEvent(
  accessToken: string,
  eventId: string,
  payload: Record<string, unknown>,
) {
  return fetchJson<GoogleCalendarApiEvent>(
    `${GOOGLE_CALENDAR_API_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    "Google Calendar event update failed.",
  );
}

export async function deleteGoogleCalendarEvent(accessToken: string, eventId: string) {
  await fetchText(
    `${GOOGLE_CALENDAR_API_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    "Google Calendar event deletion failed.",
  );
}

function parseGoogleDate(date?: string, dateTime?: string) {
  if (dateTime) return dateTime;
  if (date) return new Date(`${date}T00:00:00`).toISOString();
  return new Date().toISOString();
}

function inferEventType(summary: string, eventType?: string): CalendarEventType {
  const normalized = summary.toLowerCase();

  if (eventType === "focusTime") return "study";
  if (eventType === "outOfOffice") return "personal";
  if (["class", "lecture", "test", "exam", "assignment", "homework", "practice", "school"].some((term) => normalized.includes(term))) {
    return "school";
  }
  return "personal";
}

export function buildGoogleCalendarEventPayload(event: CalendarEvent) {
  return {
    summary: event.title,
    start: { dateTime: event.startTime },
    end: { dateTime: event.endTime },
    extendedProperties: {
      private: {
        academicOsManaged: "true",
        academicOsEventId: event.id,
        academicOsSource: "ai",
        academicOsSignature: calendarEventSignature(event),
      },
    },
  };
}

export function googleEventHasAcademicOsMarker(event: GoogleCalendarApiEvent) {
  return event.extendedProperties?.private?.academicOsManaged === "true";
}

export function googleEventToAcademicCalendarEvent(event: GoogleCalendarApiEvent) {
  if (!event.id || event.status === "cancelled") {
    return null;
  }

  const privateProps = event.extendedProperties?.private || {};
  const managed = privateProps.academicOsManaged === "true" || privateProps.academicOsSource === "ai";
  const summary = event.summary?.trim() || "Untitled event";
  const startTime = parseGoogleDate(event.start?.date, event.start?.dateTime);
  const endTime = parseGoogleDate(event.end?.date, event.end?.dateTime);

  return {
    id: managed && privateProps.academicOsEventId ? privateProps.academicOsEventId : `google-${event.id}`,
    title: summary,
    type: inferEventType(summary, event.eventType),
    startTime,
    endTime,
    fixed: !managed,
    priority: event.eventType === "focusTime" ? 8 : 5,
    createdAt: event.created || event.updated || new Date().toISOString(),
    source: managed ? "ai" : "google-calendar",
    externalId: event.id,
    confidence: managed
      ? undefined
      : {
          score: 0.99,
          reason: "Imported from Google Calendar.",
          needsConfirmation: false,
        },
  } as const;
}
