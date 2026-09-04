import { Assignment } from "./assignment";
import { CalendarEvent } from "./calendar";
import { SchoolDocument } from "./documents";
import { Grade } from "./grades";
import { Memory } from "./memory";
import { Mission } from "./mission";
import { AcademicSignal, IntegrationPermission } from "./academic-core";
import { IngestionReviewItem } from "./ingestion";
import { DailyBriefing } from "./intelligence";
import type { CalendarFollowUpItem } from "./calendar-followups";
import { AcademicGoal, AnalyticsInsight, AppSettings, DailyMissionPlan, ReflectionEntry, StudySession, TutorMessage } from "./types";
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
      focusScore: number;
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

    settings: AppSettings;

    dailyMissionPlan: DailyMissionPlan | null;

    calendarFollowUpQueue: CalendarFollowUpItem[];

    resolvedCalendarEventKeys: string[];

    missionHiddenEventTitles: string[];

    currentMission: Mission | null;

    missionHistory: Mission[];

    missionHiddenEventIds: string[];

    missionSuppressedAssignmentIds: string[];

    memory: Memory;

    integrationPermissions: IntegrationPermission[];
    integrations: IntegrationConnection[];

    academicSignals: AcademicSignal[];

    notifications: AcademicNotification[];

    dailyBriefings: DailyBriefing[];

    ingestionReviewQueue: IngestionReviewItem[];

    tutorMessages: TutorMessage[];

    analyticsInsight: AnalyticsInsight | null;
  };
