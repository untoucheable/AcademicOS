import { Assignment } from "./assignment";
import { CalendarEvent } from "./calendar";
import { SchoolDocument } from "./documents";
import { Grade } from "./grades";
import { Memory } from "./memory";
import { Mission } from "./mission";
import { AcademicSignal, IntegrationPermission } from "./academic-core";
import { IngestionReviewItem } from "./ingestion";
import { DailyBriefing } from "./intelligence";
import { AcademicGoal, ReflectionEntry, StudySession } from "./types";
import { AcademicNotification, Course, IntegrationConnection } from "./academic-graph";

export type StudentState = {
    profile: {
      name: string;
      grade: number;
      school: string;
      semesterGoal: number;
      subjects: string[];
      goals: string[];
      preferredStudyStyle: "flashcards" | "practice-problems" | "summaries" | "videos" | "teaching-back";
      availableHoursPerWeek: number;
      extracurriculars: string[];
    };
  
    status: {
      currentTime: string;
      energyLevel: number;
      stressLevel: number;
      burnoutRisk: number;
    };
  
    assignments: Assignment[];
    courses: Course[];
  
    calendar: CalendarEvent[];
  
    documents: SchoolDocument[];
  
    grades: Grade[];

    studySessions: StudySession[];

    reflections: ReflectionEntry[];

    goals: AcademicGoal[];

    currentMission: Mission | null;

    missionHistory: Mission[];

    memory: Memory;

    integrationPermissions: IntegrationPermission[];
    integrations: IntegrationConnection[];

    academicSignals: AcademicSignal[];

    notifications: AcademicNotification[];

    dailyBriefings: DailyBriefing[];

    ingestionReviewQueue: IngestionReviewItem[];

    missionHiddenEventIds: string[];
  };
