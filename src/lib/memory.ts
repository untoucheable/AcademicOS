export type SubjectPerformance = {
  subject: string;
  averageGrade: number;
  difficultyForUser: number; // 1-10
  timeMultiplier: number;
};

export type DailyPattern = {
  timeOfDay: "morning" | "afternoon" | "evening";
  focusLevel: number; // 1-10
  productivity: number; // 1-10
};

export type MistakePattern = {
  id: string;
  subject: string;
  skill: string;
  description: string;
  recommendedPractice: string;
  seenCount: number;
  lastSeenAt: string;
};

export type LearningPreference = {
  method: "flashcards" | "practice-problems" | "summaries" | "videos" | "teaching-back";
  effectiveness: number; // 1-10
  subject?: string;
  updatedAt: string;
};

export type Memory = {
  hardestSubject: string;
  easiestSubject: string;
  averageEnergyLevel: number; // 1-10
  burnoutThresholdHours: number;
  preferredStudySessionLength: number;
  preferredBreakLength: number;
  subjectPerformance: SubjectPerformance[];
  dailyPatterns: DailyPattern[];
  mistakePatterns: MistakePattern[];
  learningPreferences: LearningPreference[];
  notes: string[];
};
