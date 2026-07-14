import { AcademicSource } from "./academic-core";

export type DocumentType = "notes" | "pdf" | "assignment" | "study-guide";

export type DocumentIngestionStatus = "pending" | "processing" | "ready" | "failed";

export type GeneratedStudyMaterial = {
  summaries: string[];
  flashcardCount: number;
  practiceQuestionCount: number;
  recommendedStudyMinutes: number;
  generatedAt: string;
};

export type SchoolDocument = {
  id: string;

  title: string;

  type: DocumentType;

  subject: string;
  courseId?: string;

  content: string; // extracted text OR notes summary

  uploadedAt: string;

  lastUsedAt?: string;

  tags?: string[];

  ingestionStatus?: DocumentIngestionStatus;

  generatedStudyMaterial?: GeneratedStudyMaterial;

  source?: AcademicSource;
  externalId?: string;
};
