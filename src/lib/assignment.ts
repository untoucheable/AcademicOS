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
  studyMinutesCompleted?: number;
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

export type AssessmentSliceFramework = {
  remainingMinutes: number;
  daysUntilDue: number;
  availableStudyDays: number;
  recommendedTodayMinutes: number;
  preferredBlockMinutes: number;
  minimumBlockMinutes: number;
  maximumBlockMinutes: number;
  recommendedBlockCount: number;
};

export type TrackedWorkSliceFramework = {
  remainingMinutes: number;
  daysUntilDue: number;
  availableWorkDays: number;
  recommendedTodayMinutes: number;
  preferredBlockMinutes: number;
  minimumBlockMinutes: number;
  maximumBlockMinutes: number;
  recommendedBlockCount: number;
  shouldFinishToday: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundToNearestFive(value: number) {
  return Math.max(0, Math.round(value / 5) * 5);
}

function toUtcDateValue(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day, 0, 0, 0, 0);
}

function getDaysUntilDueDate(dueDate: string, currentTime: string) {
  const todayKey = currentTime.slice(0, 10);
  const diff = toUtcDateValue(dueDate) - toUtcDateValue(todayKey);
  return Math.round(diff / (24 * 60 * 60 * 1000));
}

export function isAssessmentPrepType(type: AssignmentAssessmentType | undefined) {
  return type === "test" || type === "quiz";
}

export function usesProgressTracking(type: AssignmentAssessmentType | undefined) {
  return !isAssessmentPrepType(type);
}

export function getAssignmentProgressPercent(
  assignment: Pick<Assignment, "assessmentType" | "progress" | "completed">,
) {
  if (assignment.completed) return 100;
  if (!usesProgressTracking(assignment.assessmentType)) return 0;
  return Math.max(0, Math.min(100, assignment.progress?.percentComplete ?? 0));
}

export function getAssessmentStudyMinutesCompleted(
  assignment: Pick<Assignment, "assessmentType" | "progress" | "completed">,
) {
  if (assignment.completed) {
    return assignment.progress?.studyMinutesCompleted ?? 0;
  }

  if (!isAssessmentPrepType(assignment.assessmentType)) return 0;
  return Math.max(0, assignment.progress?.studyMinutesCompleted ?? 0);
}

export function getAssignmentRemainingMinutes(
  assignment: Pick<Assignment, "assessmentType" | "estimatedMinutes" | "progress" | "completed">,
) {
  if (assignment.completed) return 0;
  const estimatedMinutes = Math.max(15, assignment.estimatedMinutes || 45);

  if (!usesProgressTracking(assignment.assessmentType)) {
    const studied = getAssessmentStudyMinutesCompleted(assignment);
    return Math.max(0, estimatedMinutes - studied);
  }

  const progressPercent = getAssignmentProgressPercent(assignment);
  const remaining = Math.round(estimatedMinutes * ((100 - progressPercent) / 100));
  return Math.max(15, remaining);
}

export function buildAssessmentSliceFramework(
  assignment: Pick<Assignment, "estimatedMinutes" | "priority" | "dueDate" | "assessmentType" | "progress" | "completed">,
  currentTime: string,
): AssessmentSliceFramework {
  const remainingMinutes = Math.max(0, getAssignmentRemainingMinutes(assignment));
  const daysUntilDue = getDaysUntilDueDate(assignment.dueDate, currentTime);

  if (remainingMinutes <= 0) {
    return {
      remainingMinutes: 0,
      daysUntilDue,
      availableStudyDays: 1,
      recommendedTodayMinutes: 0,
      preferredBlockMinutes: 0,
      minimumBlockMinutes: 0,
      maximumBlockMinutes: 0,
      recommendedBlockCount: 0,
    };
  }

  const availableStudyDays = Math.max(1, Math.min(14, daysUntilDue + 1));
  // Prefer one meaningful active-practice session over several tiny fragments.
  let minimumBlockMinutes = remainingMinutes < 45 ? 20 : 45;
  let maximumBlockMinutes = 75;
  let preferredBlockMinutes = remainingMinutes < 45 ? remainingMinutes : 60;
  let maxBlocksPerDay = 1;

  if (daysUntilDue <= 0) {
    minimumBlockMinutes = 45;
    maximumBlockMinutes = 90;
    preferredBlockMinutes = 75;
    maxBlocksPerDay = 3;
  } else if (daysUntilDue === 1) {
    minimumBlockMinutes = 45;
    maximumBlockMinutes = 75;
    preferredBlockMinutes = 60;
    maxBlocksPerDay = 2;
  } else if (daysUntilDue <= 3) {
    minimumBlockMinutes = 40;
    maximumBlockMinutes = 75;
    preferredBlockMinutes = 55;
    maxBlocksPerDay = 2;
  }

  if (remainingMinutes < 45) {
    minimumBlockMinutes = Math.max(15, Math.min(20, remainingMinutes));
    maximumBlockMinutes = 45;
    preferredBlockMinutes = remainingMinutes;
    maxBlocksPerDay = 1;
  }

  if (assignment.priority === "high") {
    preferredBlockMinutes += 5;
    maximumBlockMinutes = Math.min(75, maximumBlockMinutes + 10);
    maxBlocksPerDay = Math.min(3, Math.max(2, maxBlocksPerDay));
  } else if (assignment.priority === "low") {
    preferredBlockMinutes = Math.max(minimumBlockMinutes, preferredBlockMinutes - 5);
  }

  const baseTodayMinutes = roundToNearestFive(remainingMinutes / availableStudyDays);
  const urgencyFloor = daysUntilDue <= 0
    ? Math.min(remainingMinutes, 90)
    : daysUntilDue === 1
      ? Math.min(remainingMinutes, 60)
      : daysUntilDue <= 3
        ? Math.min(remainingMinutes, 45)
        : Math.min(remainingMinutes, 25);
  const dailyCap = Math.min(remainingMinutes, maximumBlockMinutes * maxBlocksPerDay);
  let recommendedTodayMinutes = roundToNearestFive(
    Math.max(baseTodayMinutes, urgencyFloor, preferredBlockMinutes),
  );

  recommendedTodayMinutes = clamp(
    recommendedTodayMinutes,
    Math.min(minimumBlockMinutes, dailyCap),
    Math.max(minimumBlockMinutes, dailyCap),
  );

  const maxPossibleBlocks = Math.max(1, Math.floor(recommendedTodayMinutes / minimumBlockMinutes));
  const recommendedBlockCount = Math.max(
    1,
    Math.min(
      maxBlocksPerDay,
      maxPossibleBlocks,
      Math.max(1, Math.ceil(recommendedTodayMinutes / Math.max(preferredBlockMinutes, 1))),
    ),
  );

  preferredBlockMinutes = clamp(
    roundToNearestFive(recommendedTodayMinutes / recommendedBlockCount),
    Math.min(minimumBlockMinutes, dailyCap),
    Math.max(minimumBlockMinutes, Math.min(maximumBlockMinutes, dailyCap)),
  );
  recommendedTodayMinutes = Math.min(
    remainingMinutes,
    preferredBlockMinutes * recommendedBlockCount,
  );

  return {
    remainingMinutes,
    daysUntilDue,
    availableStudyDays,
    recommendedTodayMinutes,
    preferredBlockMinutes,
    minimumBlockMinutes,
    maximumBlockMinutes,
    recommendedBlockCount,
  };
}

export function buildTrackedWorkSliceFramework(
  assignment: Pick<Assignment, "estimatedMinutes" | "priority" | "dueDate" | "assessmentType" | "progress" | "completed">,
  currentTime: string,
): TrackedWorkSliceFramework {
  const remainingMinutes = Math.max(0, getAssignmentRemainingMinutes(assignment));
  const daysUntilDue = getDaysUntilDueDate(assignment.dueDate, currentTime);
  const shouldFinishToday = daysUntilDue <= 1;

  if (remainingMinutes <= 0) {
    return {
      remainingMinutes: 0,
      daysUntilDue,
      availableWorkDays: 1,
      recommendedTodayMinutes: 0,
      preferredBlockMinutes: 0,
      minimumBlockMinutes: 0,
      maximumBlockMinutes: 0,
      recommendedBlockCount: 0,
      shouldFinishToday,
    };
  }

  const availableWorkDays = Math.max(1, Math.min(14, daysUntilDue + 1));

  if (shouldFinishToday) {
    const minimumBlockMinutes = 25;
    const maximumBlockMinutes = Math.min(90, Math.max(45, roundToNearestFive(Math.max(45, remainingMinutes))));
    const recommendedBlockCount = Math.max(1, Math.min(3, Math.ceil(remainingMinutes / 50)));
    const preferredBlockMinutes = clamp(
      roundToNearestFive(remainingMinutes / recommendedBlockCount),
      minimumBlockMinutes,
      maximumBlockMinutes,
    );

    return {
      remainingMinutes,
      daysUntilDue,
      availableWorkDays,
      recommendedTodayMinutes: remainingMinutes,
      preferredBlockMinutes,
      minimumBlockMinutes,
      maximumBlockMinutes,
      recommendedBlockCount,
      shouldFinishToday,
    };
  }

  let minimumBlockMinutes = remainingMinutes < 45 ? 20 : 45;
  let maximumBlockMinutes = 75;
  let preferredBlockMinutes = remainingMinutes < 45 ? remainingMinutes : 60;
  let maxBlocksPerDay = 1;

  if (daysUntilDue <= 3) {
    minimumBlockMinutes = 45;
    maximumBlockMinutes = 75;
    preferredBlockMinutes = 60;
    maxBlocksPerDay = 2;
  } else if (daysUntilDue <= 5) {
    minimumBlockMinutes = 40;
    maximumBlockMinutes = 75;
    preferredBlockMinutes = 55;
    maxBlocksPerDay = 2;
  }

  if (remainingMinutes < 45) {
    minimumBlockMinutes = Math.max(15, Math.min(20, remainingMinutes));
    maximumBlockMinutes = 45;
    preferredBlockMinutes = remainingMinutes;
    maxBlocksPerDay = 1;
  }

  if (assignment.priority === "high") {
    preferredBlockMinutes += 10;
    maximumBlockMinutes = Math.min(75, maximumBlockMinutes + 10);
    maxBlocksPerDay = Math.min(3, maxBlocksPerDay + 1);
  } else if (assignment.priority === "low") {
    preferredBlockMinutes = Math.max(minimumBlockMinutes, preferredBlockMinutes - 5);
  }

  const baseTodayMinutes = roundToNearestFive(remainingMinutes / availableWorkDays);
  const urgencyFloor = daysUntilDue <= 3
    ? Math.min(remainingMinutes, 45)
    : daysUntilDue <= 5
      ? Math.min(remainingMinutes, 35)
      : Math.min(remainingMinutes, 25);
  let recommendedTodayMinutes = roundToNearestFive(
    Math.max(baseTodayMinutes, urgencyFloor, preferredBlockMinutes),
  );
  const dailyCap = Math.min(remainingMinutes, maximumBlockMinutes * maxBlocksPerDay);
  recommendedTodayMinutes = clamp(
    recommendedTodayMinutes,
    Math.min(minimumBlockMinutes, dailyCap),
    Math.max(minimumBlockMinutes, dailyCap),
  );

  const recommendedBlockCount = Math.max(
    1,
    Math.min(
      maxBlocksPerDay,
      Math.ceil(recommendedTodayMinutes / Math.max(preferredBlockMinutes, 1)),
    ),
  );
  preferredBlockMinutes = clamp(
    roundToNearestFive(recommendedTodayMinutes / recommendedBlockCount),
    minimumBlockMinutes,
    Math.max(minimumBlockMinutes, Math.min(maximumBlockMinutes, dailyCap)),
  );
  recommendedTodayMinutes = Math.min(
    remainingMinutes,
    preferredBlockMinutes * recommendedBlockCount,
  );

  return {
    remainingMinutes,
    daysUntilDue,
    availableWorkDays,
    recommendedTodayMinutes,
    preferredBlockMinutes,
    minimumBlockMinutes,
    maximumBlockMinutes,
    recommendedBlockCount,
    shouldFinishToday,
  };
}

export function getRecommendedAssessmentStudyBlockMinutes(
  assignment: Pick<Assignment, "estimatedMinutes" | "priority" | "dueDate" | "assessmentType" | "progress" | "completed">,
  currentTime: string,
) {
  return buildAssessmentSliceFramework(assignment, currentTime).preferredBlockMinutes;
}
