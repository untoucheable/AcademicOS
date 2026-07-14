import { Assignment } from "./assignment";
import { Grade } from "./grades";
import { Memory } from "./memory";
import { Mission } from "./mission";

function daysUntil(date: string) {
  const now = new Date();
  const target = new Date(date);
  return Math.ceil((target.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

export function calculateGradeAverage(grade: Grade) {
  if (!grade.entries.length) return grade.currentAverage;

  const weightedTotal = grade.entries.reduce((total, entry) => {
    const weight = entry.weight || 1;
    return total + (entry.score / entry.maxScore) * 100 * weight;
  }, 0);
  const totalWeight = grade.entries.reduce((total, entry) => total + (entry.weight || 1), 0);

  return Math.round((weightedTotal / totalWeight) * 10) / 10;
}

export function buildSubjectIntelligence(grades: Grade[], memory: Memory) {
  const gradeSubjects = grades.map((grade) => {
    const average = calculateGradeAverage(grade);
    const remembered = memory.subjectPerformance.find(
      (subject) => subject.subject.toLowerCase() === grade.subject.toLowerCase()
    );

    return {
      subject: grade.subject,
      average,
      target: grade.targetAverage,
      gap: Math.round((grade.targetAverage - average) * 10) / 10,
      difficulty: remembered?.difficultyForUser || Math.max(1, Math.min(10, Math.round((100 - average) / 8))),
      status: average >= grade.targetAverage ? "on-track" : average < grade.targetAverage - 8 ? "at-risk" : "watch",
    };
  });

  const memoryOnlySubjects = memory.subjectPerformance
    .filter(
      (subject) =>
        !gradeSubjects.some((grade) => grade.subject.toLowerCase() === subject.subject.toLowerCase())
    )
    .map((subject) => ({
      subject: subject.subject,
      average: subject.averageGrade,
      target: subject.averageGrade,
      gap: 0,
      difficulty: subject.difficultyForUser,
      status: subject.difficultyForUser >= 7 ? "watch" : "on-track",
    }));

  return [...gradeSubjects, ...memoryOnlySubjects].sort((a, b) => {
    if (a.status === "at-risk" && b.status !== "at-risk") return -1;
    if (b.status === "at-risk" && a.status !== "at-risk") return 1;
    return b.gap - a.gap;
  });
}

export function scoreAssignmentPriority(assignment: Assignment, grades: Grade[], memory: Memory) {
  const dueIn = daysUntil(assignment.dueDate);
  const urgency = Math.max(1, Math.min(10, 11 - dueIn));
  const grade = grades.find((item) => item.subject.toLowerCase() === assignment.subject?.toLowerCase());
  const performance = memory.subjectPerformance.find(
    (item) => item.subject.toLowerCase() === assignment.subject?.toLowerCase()
  );
  const gradeImpact = grade
    ? Math.max(1, Math.min(10, Math.round((grade.targetAverage - calculateGradeAverage(grade) + 10) / 2)))
    : assignment.priority === "high"
      ? 8
      : assignment.priority === "medium"
        ? 6
        : 4;
  const difficulty = performance?.difficultyForUser || (assignment.priority === "high" ? 8 : 5);
  const workload = Math.max(1, Math.min(10, Math.round((assignment.estimatedMinutes || 45) / 30)));
  const score = Math.round(urgency * 0.35 + gradeImpact * 0.3 + difficulty * 0.2 + workload * 0.15);

  return {
    assignmentId: assignment.id,
    title: assignment.title,
    subject: assignment.subject || assignment.course,
    urgency,
    gradeImpact,
    difficulty,
    workload,
    score,
    recommendedPriority: score >= 8 ? "high" : score >= 5 ? "medium" : "low",
    reason: `${assignment.title} is prioritized because it is due in ${dueIn} day${dueIn === 1 ? "" : "s"}, has ${gradeImpact}/10 grade impact, and has ${difficulty}/10 difficulty.`,
  };
}

export function buildAcademicAnalytics({
  assignments,
  grades,
  memory,
  mission,
}: {
  assignments: Assignment[];
  grades: Grade[];
  memory: Memory;
  mission: Mission | null;
}) {
  const activeAssignments = assignments.filter((assignment) => !assignment.completed);
  const overdue = activeAssignments.filter((assignment) => daysUntil(assignment.dueDate) < 0);
  const dueSoon = activeAssignments.filter((assignment) => {
    const days = daysUntil(assignment.dueDate);
    return days >= 0 && days <= 3;
  });
  const workloadMinutes = activeAssignments.reduce(
    (total, assignment) => total + (assignment.estimatedMinutes || 45),
    0
  );
  const scheduledMinutes = (mission?.schedule || []).reduce((total, event) => {
    if (event.type !== "study") return total;
    return total + Math.max(0, new Date(event.endTime).getTime() - new Date(event.startTime).getTime()) / 60000;
  }, 0);
  const priorityScores = activeAssignments
    .map((assignment) => scoreAssignmentPriority(assignment, grades, memory))
    .sort((a, b) => b.score - a.score);
  const subjectIntelligence = buildSubjectIntelligence(grades, memory);
  const weakestSubject = subjectIntelligence.find((subject) => subject.status === "at-risk") || subjectIntelligence[0];
  const strongestSubject = [...subjectIntelligence].sort((a, b) => b.average - a.average)[0];

  return {
    activeAssignments: activeAssignments.length,
    overdueAssignments: overdue.length,
    dueSoonAssignments: dueSoon.length,
    workloadMinutes,
    scheduledStudyMinutes: Math.round(scheduledMinutes),
    burnoutRisk:
      workloadMinutes > memory.burnoutThresholdHours * 60 || dueSoon.length >= 4
        ? "high"
        : dueSoon.length >= 2
          ? "medium"
          : "low",
    subjectIntelligence,
    weakestSubject,
    strongestSubject,
    priorityScores,
    decisionExplanations: priorityScores.slice(0, 4).map((score) => score.reason),
  };
}
