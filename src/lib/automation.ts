import { AcademicSourceProvider } from "./academic-core";

export type AutomationProvider = {
  provider: AcademicSourceProvider;
  label: string;
  category: "school" | "communication" | "documents" | "calendar" | "capture";
  description: string;
  scopes: string[];
  capabilities: string[];
  status: "available" | "planned";
};

export const automationProviders: AutomationProvider[] = [
  {
    provider: "google-classroom",
    label: "Google Classroom",
    category: "school",
    description: "Import classes, assignments, due dates, teacher instructions, attachments, and available grades.",
    scopes: ["classes", "assignments", "announcements", "attachments", "grades"],
    capabilities: ["Assignment import", "Deadline detection", "Teacher instruction parsing"],
    status: "available",
  },
  {
    provider: "brightspace",
    label: "D2L Brightspace",
    category: "school",
    description: "Track course content, quizzes, tests, announcements, and deadline changes from learning platforms.",
    scopes: ["courses", "assignments", "quizzes", "announcements", "content"],
    capabilities: ["Quiz detection", "Course page monitoring", "Preparation time creation"],
    status: "available",
  },
  {
    provider: "gmail",
    label: "School Email",
    category: "communication",
    description: "Find teacher announcements, changed due dates, missed communication, and academic reminders.",
    scopes: ["messages", "teacher-announcements", "deadlines", "schedule-changes"],
    capabilities: ["Email summaries", "Deadline extraction", "Missed update warnings"],
    status: "planned",
  },
  {
    provider: "google-drive",
    label: "Cloud Documents",
    category: "documents",
    description: "Use notes, PDFs, worksheets, slides, textbooks, and assignments to generate study material.",
    scopes: ["files", "notes", "pdfs", "presentations", "worksheets"],
    capabilities: ["Document summaries", "Flashcards", "Practice questions"],
    status: "planned",
  },
  {
    provider: "website-scanner",
    label: "Website Scanner",
    category: "capture",
    description: "Monitor school websites, course pages, homework pages, and calendars for important changes.",
    scopes: ["announcements", "course-pages", "homework-pages", "calendar-pages"],
    capabilities: ["Uncertain finding review", "Confidence scoring", "Deadline monitoring"],
    status: "planned",
  },
  {
    provider: "browser-extension",
    label: "Browser Extension",
    category: "capture",
    description: "Understand academic pages while the student browses school and learning websites.",
    scopes: ["active-page", "assignment-pages", "due-date-detection"],
    capabilities: ["Due-soon warnings", "Page understanding", "One-click mission updates"],
    status: "planned",
  },
  {
    provider: "outlook",
    label: "Calendar Sync",
    category: "calendar",
    description: "Sync AcademicOS events with external calendars and protect class time from study scheduling.",
    scopes: ["calendar-read", "calendar-write", "class-schedule", "exam-schedule"],
    capabilities: ["Two-way sync", "Class schedule import", "Conflict protection"],
    status: "planned",
  },
];

export const automationCategories = [
  { id: "school", label: "School Platforms" },
  { id: "communication", label: "Email Intelligence" },
  { id: "documents", label: "Documents" },
  { id: "calendar", label: "Calendar" },
  { id: "capture", label: "Capture" },
] as const;
