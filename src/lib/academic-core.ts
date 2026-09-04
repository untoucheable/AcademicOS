export type AcademicSourceProvider =
  | "manual"
  | "ai"
  | "google-calendar"
  | "google-classroom"
  | "brightspace"
  | "canvas"
  | "moodle"
  | "blackboard"
  | "gmail"
  | "outlook"
  | "google-drive"
  | "onedrive"
  | "dropbox"
  | "browser-extension"
  | "website-scanner";

export type SourceConfidence = {
  score: number;
  reason: string;
  needsConfirmation: boolean;
};

export type AcademicSource = {
  provider: AcademicSourceProvider;
  externalId?: string;
  url?: string;
  importedAt: string;
  lastSyncedAt?: string;
  confidence: SourceConfidence;
};

export type IntegrationPermission = {
  provider: AcademicSourceProvider;
  enabled: boolean;
  scopes: string[];
  grantedAt?: string;
  revokedAt?: string;
};

export type AcademicSignalType =
  | "deadline-risk"
  | "overload-risk"
  | "schedule-conflict"
  | "weak-subject"
  | "missed-communication"
  | "study-opportunity"
  | "burnout-risk";

export type AcademicSignal = {
  id: string;
  type: AcademicSignalType;
  title: string;
  summary: string;
  priority: number;
  confidence: SourceConfidence;
  relatedAssignmentId?: string;
  relatedSubject?: string;
  createdAt: string;
};
