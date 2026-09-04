import { ingestAssignmentWithReview, ingestDocumentWithReview } from "@/lib/intake-pipeline";
import { syncIntegrationConnection } from "@/lib/sync-service";
import type { StudentState } from "@/lib/student-state";

import { requireBrightspaceConfig } from "./config";

type BrightspaceEnrollment = {
  OrgUnit?: { Id?: number; Name?: string };
  OrgUnitId?: number;
  OrgUnitName?: string;
  Name?: string;
  Title?: string;
};

type BrightspaceNewsItem = {
  Id?: number | string;
  Title?: string;
  Body?: { Text?: string } | string;
  Text?: string;
  StartDate?: string;
  EndDate?: string;
  Url?: string;
};

type SyncSummary = {
  courses: number;
  assignments: number;
  documents: number;
  reviewQueued: number;
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function extractArray<T>(payload: unknown, keys: string[] = ["Items", "items", "Objects", "objects"]) {
  if (Array.isArray(payload)) return payload as T[];
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key] as T[];
  }
  return [];
}

function fetchJsonWithAuth<T>(accessToken: string, url: string): Promise<T> {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  }).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.Message || data.error || `Brightspace request failed (${response.status}).`);
    }
    return data as T;
  });
}

function courseTitle(enrollment: BrightspaceEnrollment) {
  return (
    enrollment.OrgUnit?.Name ||
    enrollment.OrgUnitName ||
    enrollment.Name ||
    enrollment.Title ||
    "Brightspace Course"
  );
}

function courseId(enrollment: BrightspaceEnrollment) {
  return String(
    enrollment.OrgUnit?.Id ||
    enrollment.OrgUnitId ||
    enrollment.Name ||
    enrollment.Title ||
    courseTitle(enrollment),
  );
}

function newsText(item: BrightspaceNewsItem) {
  return typeof item.Body === "string" ? item.Body : item.Body?.Text || item.Text || "";
}

function parseDueDate(text: string, fallback?: string) {
  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();
  if (fallback) {
    const fallbackDate = new Date(fallback);
    if (!Number.isNaN(fallbackDate.getTime())) return fallbackDate.toISOString();
  }
  return null;
}

function priorityForDueDate(dueDate: string) {
  const daysUntilDue = Math.ceil((new Date(dueDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (daysUntilDue <= 1) return "high" as const;
  if (daysUntilDue <= 3) return "medium" as const;
  return "low" as const;
}

export async function syncBrightspaceState(state: StudentState, accessToken: string) {
  const config = requireBrightspaceConfig();
  const summary: SyncSummary = {
    courses: 0,
    assignments: 0,
    documents: 0,
    reviewQueued: 0,
  };

  const enrollmentsResponse = await fetchJsonWithAuth<unknown>(
    accessToken,
    `${config.apiBase.replace(/\/$/, "")}${config.enrollmentsPath}`,
  );
  const enrollments = extractArray<BrightspaceEnrollment>(enrollmentsResponse);

  let nextState = state;

  for (const enrollment of enrollments) {
    const title = courseTitle(enrollment);
    const id = courseId(enrollment);
    summary.courses += 1;

    const newsResponse = await fetchJsonWithAuth<unknown>(
      accessToken,
      `${config.apiBase.replace(/\/$/, "")}${config.newsPathTemplate.replace("{orgUnitId}", encodeURIComponent(id))}`,
    );
    const newsItems = extractArray<BrightspaceNewsItem>(newsResponse, ["NewsItems", "items", "Objects", "objects"]);

    for (const item of newsItems) {
      const text = newsText(item).trim();
      if (!text) continue;

      const titleText = item.Title?.trim() || `${title}: Announcement`;
      const dueDate = parseDueDate(text, item.StartDate || item.EndDate);
      const sourceId = `${id}:${item.Id || normalize(titleText)}`;

      if (dueDate && /(assignment|homework|quiz|test|project|exam)/i.test(`${titleText} ${text}`)) {
        const result = ingestAssignmentWithReview(nextState, {
          title: titleText,
          course: title,
          subject: title,
          dueDate,
          priority: priorityForDueDate(dueDate),
          description: text,
          source: {
            provider: "brightspace",
            externalId: sourceId,
            url: item.Url,
            importedAt: new Date().toISOString(),
            lastSyncedAt: new Date().toISOString(),
            confidence: {
              score: 0.88,
              reason: "Imported from Brightspace news item with a due date.",
              needsConfirmation: false,
            },
          },
        });

        nextState = result.state;
        if (result.imported) {
          summary.assignments += 1;
        } else {
          summary.reviewQueued += 1;
        }
        continue;
      }

      const result = ingestDocumentWithReview(nextState, {
        title: titleText,
        type: "notes",
        subject: title,
        content: text,
        tags: ["brightspace", "announcement"],
        source: {
          provider: "brightspace",
          externalId: sourceId,
          url: item.Url,
          importedAt: new Date().toISOString(),
          lastSyncedAt: new Date().toISOString(),
          confidence: {
            score: 0.84,
            reason: "Imported Brightspace announcement.",
            needsConfirmation: false,
          },
        },
      });

      nextState = result.state;
      if (result.imported) {
        summary.documents += 1;
      } else {
        summary.reviewQueued += 1;
      }
    }
  }

  nextState = syncIntegrationConnection(
    nextState,
    "brightspace",
    `Brightspace import complete: ${summary.assignments} assignments, ${summary.documents} announcements, ${summary.reviewQueued} queued for review.`,
    summary.assignments + summary.documents + summary.reviewQueued,
    "success",
    true,
  );

  return {
    state: nextState,
    summary,
  };
}
