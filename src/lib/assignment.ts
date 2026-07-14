import { AcademicSource } from "./academic-core";

export type AssignmentPriority = "low" | "medium" | "high";

export type AssignmentAssessmentType =
  | "assignment"
  | "homework"
  | "test"
  | "quiz"
  | "project";

export type AssignmentStatus = "todo" | "in-progress" | "done";

export type AssignmentStep = {
  id: string;
  title: string;
  completed: boolean;
  estimatedMinutes: number;
  reason: string;
};

export type AssignmentProgress = {
  percentComplete: number;
  completedSteps: string[];
  remainingSteps: AssignmentStep[];
  lastUpdatedAt: string;
};

export type Assignment = {
  id: string;

  title: string;
  course: string;
  courseId?: string;
  subject?: string;
  assessmentType?: AssignmentAssessmentType;

  description?: string;
  notes?: string;

  dueDate: string; // ISO date

  priority: AssignmentPriority;

  status?: AssignmentStatus;

  completed: boolean; 

  estimatedMinutes?: number;

  recommendedStartDate?: string;

  progress?: AssignmentProgress;

  source?: AcademicSource;
  externalId?: string;

  createdAt: string;
  updatedAt: string;
};
