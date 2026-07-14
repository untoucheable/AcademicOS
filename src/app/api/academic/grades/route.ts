import { calculateGradeAverage } from "@/lib/academic-analytics";
import { emitDomainEvent } from "@/lib/domain-events";
import { GradeEntry } from "@/lib/grades";
import { getState, updateState } from "@/lib/server-state";

export async function GET() {
  const state = getState();

  return Response.json({
    grades: state.grades.map((grade) => ({
      ...grade,
      currentAverage: calculateGradeAverage(grade),
    })),
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const subject = String(body.subject || "").trim();
    const assignmentName = String(body.assignmentName || "").trim();
    const score = Number(body.score);
    const maxScore = Number(body.maxScore || 100);
    const targetAverage = Number(body.targetAverage || 90);
    const weight = body.weight ? Number(body.weight) : undefined;

    if (!subject || !assignmentName || Number.isNaN(score) || Number.isNaN(maxScore) || maxScore <= 0) {
      return Response.json(
        { error: "Subject, assignment name, score, and max score are required." },
        { status: 400 }
      );
    }

    const entry: GradeEntry = {
      id: crypto.randomUUID(),
      subject,
      assignmentName,
      score,
      maxScore,
      weight,
      date: new Date().toISOString(),
    };

    const updated = updateState((state) => {
      const existing = state.grades.find(
        (grade) => grade.subject.toLowerCase() === subject.toLowerCase()
      );
      const nextGrade = existing
        ? {
            ...existing,
            targetAverage: existing.targetAverage || targetAverage,
            entries: [entry, ...existing.entries],
          }
        : {
            subject,
            currentAverage: 0,
            targetAverage,
            entries: [entry],
          };

      nextGrade.currentAverage = calculateGradeAverage(nextGrade);

      return {
        ...state,
        grades: existing
          ? state.grades.map((grade) =>
              grade.subject.toLowerCase() === subject.toLowerCase() ? nextGrade : grade
            )
          : [...state.grades, nextGrade],
        memory: {
          ...state.memory,
          hardestSubject:
            nextGrade.currentAverage < 80 ? nextGrade.subject : state.memory.hardestSubject,
          easiestSubject:
            nextGrade.currentAverage >= 90 ? nextGrade.subject : state.memory.easiestSubject,
          subjectPerformance: [
            {
              subject,
              averageGrade: nextGrade.currentAverage,
              difficultyForUser: Math.max(1, Math.min(10, Math.round((100 - nextGrade.currentAverage) / 8))),
              timeMultiplier: nextGrade.currentAverage < targetAverage ? 1.4 : 1,
            },
            ...state.memory.subjectPerformance.filter(
              (item) => item.subject.toLowerCase() !== subject.toLowerCase()
            ),
          ],
        },
      };
    });

    emitDomainEvent("grade.recorded", {
      subject,
      assignmentName,
      score,
      maxScore,
      targetAverage,
    });
    emitDomainEvent("mission.regeneration.requested", {
      reason: `Grade recorded for ${subject}`,
      subject,
    });

    return Response.json({
      grades: updated.grades,
      memory: updated.memory,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Grade update failed";

    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
}
