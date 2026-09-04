import { ingestAssignmentWithReview, ingestDocumentWithReview } from "@/lib/intake-pipeline";
import { syncIntegrationConnection } from "@/lib/sync-service";
import type { StudentState } from "@/lib/student-state";

const GOOGLE_CLASSROOM_API_BASE = "https://classroom.googleapis.com/v1";

type GoogleClassroomCourse = {
  id: string;
  name?: string;
  section?: string;
  alternateLink?: string;
  courseState?: string;
};

type GoogleClassroomCourseWork = {
  id: string;
  title?: string;
  description?: string;
  alternateLink?: string;
  dueDate?: { year?: number; month?: number; day?: number };
  dueTime?: { hours?: number; minutes?: number; seconds?: number };
  maxPoints?: number;
};

type GoogleClassroomAnnouncement = {
  id: string;
  text?: string;
  alternateLink?: string;
  creationTime?: string;
  updateTime?: string;
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

function fetchJsonWithAuth<T>(accessToken: string, url: string): Promise<T> {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  }).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error?.message || data.error || `Google Classroom request failed (${response.status}).`);
    }
    return data as T;
  });
}

async function listAll<T>(
  accessToken: string,
  path: string,
  collectionKey: string,
) {
  const items: T[] = [];
  let pageToken: string | undefined;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const url = new URL(`${GOOGLE_CLASSROOM_API_BASE}${path}`);
    url.searchParams.set("pageSize", "100");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetchJsonWithAuth<Record<string, unknown>>(accessToken, url.toString());
    const nextItems = Array.isArray(response[collectionKey]) ? (response[collectionKey] as T[]) : [];
    items.push(...nextItems);

    const nextToken = typeof response.nextPageToken === "string" ? response.nextPageToken : "";
    if (!nextToken) break;
    pageToken = nextToken;
  }

  return items;
}

function toIsoDate(value?: { year?: number; month?: number; day?: number }, time?: { hours?: number; minutes?: number; seconds?: number }) {
  if (!value?.year || !value?.month || !value?.day) return null;

  const date = new Date(Date.UTC(
    value.year,
    value.month - 1,
    value.day,
    time?.hours ?? 23,
    time?.minutes ?? 59,
    time?.seconds ?? 59,
  ));

  return date.toISOString();
}

function courseSubject(course: GoogleClassroomCourse) {
  return course.section || course.name || "Google Classroom";
}

function assessmentTypeFromTitle(title: string) {
  const normalized = normalize(title);
  if (/\b(test|quiz|exam)\b/.test(normalized)) return "test" as const;
  if (/\b(project)\b/.test(normalized)) return "project" as const;
  if (/\b(homework)\b/.test(normalized)) return "homework" as const;
  return "assignment" as const;
}

function priorityForDueDate(dueDate: string) {
  const daysUntilDue = Math.ceil((new Date(dueDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (daysUntilDue <= 1) return "high" as const;
  if (daysUntilDue <= 3) return "medium" as const;
  return "low" as const;
}

export async function syncGoogleClassroomState(state: StudentState, accessToken: string) {
  const summary: SyncSummary = {
    courses: 0,
    assignments: 0,
    documents: 0,
    reviewQueued: 0,
  };

  const courses = await listAll<GoogleClassroomCourse>(accessToken, "/courses", "courses");
  let nextState = state;

  for (const course of courses.filter((course) => course.courseState !== "ARCHIVED")) {
    summary.courses += 1;
    const subject = courseSubject(course);

    const coursework = await listAll<GoogleClassroomCourseWork>(
      accessToken,
      `/courses/${course.id}/courseWork`,
      "courseWork",
    );

    for (const work of coursework) {
      if (!work.id || !work.title) continue;
      const dueDate = toIsoDate(work.dueDate, work.dueTime);
      if (!dueDate) continue;

      const result = ingestAssignmentWithReview(nextState, {
        title: work.title.trim(),
        course: subject,
        subject,
        dueDate,
        assessmentType: assessmentTypeFromTitle(work.title),
        priority: priorityForDueDate(dueDate),
        description: work.description,
        estimatedMinutes: work.maxPoints ? Math.max(30, Math.round(work.maxPoints * 10)) : undefined,
        source: {
          provider: "google-classroom",
          externalId: `${course.id}:${work.id}`,
          url: work.alternateLink,
          importedAt: new Date().toISOString(),
          lastSyncedAt: new Date().toISOString(),
          confidence: {
            score: 0.98,
            reason: "Imported from Google Classroom coursework.",
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
    }

    const announcements = await listAll<GoogleClassroomAnnouncement>(
      accessToken,
      `/courses/${course.id}/announcements`,
      "announcements",
    );

    for (const announcement of announcements) {
      if (!announcement.id || !announcement.text) continue;

      const result = ingestDocumentWithReview(nextState, {
        title: `${subject}: Announcement`,
        type: "notes",
        subject,
        content: announcement.text.trim(),
        tags: ["google-classroom", "announcement"],
        source: {
          provider: "google-classroom",
          externalId: `${course.id}:${announcement.id}`,
          url: announcement.alternateLink,
          importedAt: new Date().toISOString(),
          lastSyncedAt: new Date().toISOString(),
          confidence: {
            score: 0.94,
            reason: "Imported Google Classroom announcement.",
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
    "google-classroom",
    `Google Classroom import complete: ${summary.assignments} assignments, ${summary.documents} announcements, ${summary.reviewQueued} queued for review.`,
    summary.assignments + summary.documents + summary.reviewQueued,
    "success",
    true,
  );

  return {
    state: nextState,
    summary,
  };
}
