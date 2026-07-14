import { AcademicSourceProvider, SourceConfidence } from "./academic-core";

export type CalendarEventType =
  | "study"
  | "break"
  | "school"
  | "exercise"
  | "personal";

export type CalendarEvent = {
  id: string;
  title: string;
  type: CalendarEventType;
  startTime: string;
  endTime: string;
  externalId?: string;
  relatedAssignmentId?: string;
  relatedCourseId?: string;
  missionId?: string;
  fixed?: boolean;
  priority: number;
  createdAt: string;
  source?: "ai" | "manual" | AcademicSourceProvider;
  confidence?: SourceConfidence;
};
