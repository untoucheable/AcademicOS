import { ingestCalendarEvent } from "@/lib/ingestion";
import { syncIntegrationConnection } from "@/lib/sync-service";
import type { StudentState } from "@/lib/student-state";

import { requireGoogleCalendarConfig } from "./config";
import {
  googleEventHasAcademicOsMarker,
  googleEventToAcademicCalendarEvent,
  listGoogleCalendarEvents,
} from "./calendar";
import {
  readGoogleCalendarConnection,
  setGoogleCalendarConnection,
} from "./store";
import { ensureFreshGoogleCalendarTokens } from "./oauth";

type GoogleCalendarSyncRange = {
  timeMin: string;
  timeMax: string;
};

type SyncSummary = {
  imported: number;
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
};

export async function syncGoogleCalendarState(
  state: StudentState,
  range: GoogleCalendarSyncRange,
): Promise<{ state: StudentState; summary: SyncSummary; connectionError?: string }> {
  const config = requireGoogleCalendarConfig();
  const tokens = await ensureFreshGoogleCalendarTokens(config);

  const summary: SyncSummary = {
    imported: 0,
    created: 0,
    updated: 0,
    deleted: 0,
    skipped: 0,
  };

  let nextState = state;
  const googleEvents = await listGoogleCalendarEvents(tokens.accessToken, range);

  for (const googleEvent of googleEvents) {
    if (!googleEvent.id) continue;

    if (googleEvent.status === "cancelled") {
      nextState = {
        ...nextState,
        calendar: nextState.calendar.filter((event) => event.externalId !== googleEvent.id),
      };
      summary.deleted += 1;
      continue;
    }

    const mapped = googleEventToAcademicCalendarEvent(googleEvent);
    if (!mapped) continue;

    if (googleEventHasAcademicOsMarker(googleEvent)) {
      const localEvent = nextState.calendar.find((event) => event.id === mapped.id || event.externalId === googleEvent.id);
      if (localEvent) {
        nextState = {
          ...nextState,
          calendar: nextState.calendar.map((event) =>
            event.id === localEvent.id
              ? {
                  ...event,
                  source: "ai" as const,
                  fixed: false,
                  externalId: googleEvent.id,
                }
              : event,
          ),
        };
      } else {
        nextState = {
          ...nextState,
          calendar: [...nextState.calendar, {
            ...mapped,
            externalId: googleEvent.id,
          }],
        };
      }
      summary.updated += 1;
      continue;
    }

    nextState = ingestCalendarEvent(nextState, {
      title: mapped.title,
      type: mapped.type,
      startTime: mapped.startTime,
      endTime: mapped.endTime,
      priority: mapped.priority,
      source: {
        provider: "google-calendar",
        externalId: googleEvent.id,
        url: googleEvent.htmlLink,
        importedAt: new Date().toISOString(),
        lastSyncedAt: new Date().toISOString(),
        confidence: {
          score: 0.99,
          reason: "Imported from Google Calendar.",
          needsConfirmation: false,
        },
        },
      });
    summary.imported += 1;
  }

  const syncedAt = new Date().toISOString();
  const connection = readGoogleCalendarConnection();
  setGoogleCalendarConnection({
    connected: true,
    accountEmail: tokens.accountEmail,
    grantedScopes: tokens.grantedScopes,
    lastSyncAt: syncedAt,
    tokenExpiresAt: tokens.expiresAt,
    latestError: null,
    providerAccountId: tokens.providerAccountId,
  });

  nextState = syncIntegrationConnection(
    nextState,
    "google-calendar",
    `Google Calendar import complete: ${summary.imported} imported, ${summary.created} created, ${summary.updated} updated, ${summary.deleted} deleted.`,
    summary.imported + summary.created + summary.updated + summary.deleted,
    "success",
    true,
  );

  return {
    state: nextState,
    summary,
    connectionError: connection?.latestError || undefined,
  };
}

export async function syncGoogleCalendarRange(
  state: StudentState,
  options?: Partial<GoogleCalendarSyncRange>,
) {
  const now = new Date();
  const timeMin = options?.timeMin || new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = options?.timeMax || new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString();

  return syncGoogleCalendarState(state, { timeMin, timeMax });
}

export async function requestMissionRebuild(origin: string, timeZone: string, input: string) {
  try {
    const response = await fetch(new URL("/api/mission", origin), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input,
        currentTime: new Date().toISOString(),
        timeZone,
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}
