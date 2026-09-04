export type IntegrationPhase = "now" | "next" | "later";

export type IntegrationRoadmapItem = {
  provider: string;
  name: string;
  phase: IntegrationPhase;
  auth: "oauth" | "api" | "extension" | "mobile" | "local";
  access: "read-only" | "read-write" | "mixed";
  notes: string;
};

export const integrationRoadmap: IntegrationRoadmapItem[] = [
  {
    provider: "google-calendar",
    name: "Google Calendar",
    phase: "now",
    auth: "oauth",
    access: "mixed",
    notes: "Two-way sync with conflict handling and ownership tracking.",
  },
  {
    provider: "google-classroom",
    name: "Google Classroom",
    phase: "now",
    auth: "oauth",
    access: "read-only",
    notes: "Import assignments and announcements, then dedupe into the academic graph.",
  },
  {
    provider: "gmail",
    name: "Gmail",
    phase: "now",
    auth: "oauth",
    access: "read-only",
    notes: "Scan for academic emails and turn them into reviewable imports.",
  },
  {
    provider: "google-drive",
    name: "Google Drive",
    phase: "next",
    auth: "oauth",
    access: "read-only",
    notes: "Pull in documents, slides, and study files for the knowledge base.",
  },
  {
    provider: "d2l",
    name: "D2L / Brightspace",
    phase: "now",
    auth: "oauth",
    access: "read-only",
    notes: "Import courses, announcements, and deadline signals from Brightspace.",
  },
  {
    provider: "browser-extension",
    name: "Browser Extension",
    phase: "next",
    auth: "extension",
    access: "mixed",
    notes: "Useful for course pages, portals, and page-level import actions.",
  },
  {
    provider: "mobile-app",
    name: "Mobile App",
    phase: "later",
    auth: "mobile",
    access: "mixed",
    notes: "Mobile-first access after the shared backend behavior is stable.",
  },
  {
    provider: "voice",
    name: "Voice Assistant",
    phase: "later",
    auth: "local",
    access: "mixed",
    notes: "Push-to-talk commands layered on top of the command processor.",
  },
  {
    provider: "camera-scanning",
    name: "Camera Scanning",
    phase: "later",
    auth: "local",
    access: "read-only",
    notes: "OCR pipeline for worksheets, notes, and printed handouts.",
  },
  {
    provider: "research",
    name: "Research Assistant",
    phase: "later",
    auth: "oauth",
    access: "read-only",
    notes: "Citation-aware search and summarization on top of imported sources.",
  },
];
