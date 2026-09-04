import { writeDatabase } from "@/lib/database";
import { defaultStudentState } from "@/lib/default-state";
import { updateState } from "@/lib/server-state";
import { emitDomainEvent } from "@/lib/domain-events";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    if (body?.action !== "reset-all") {
      return Response.json(
        { error: "Unsupported action" },
        { status: 400 }
      );
    }

    await writeDatabase({
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      state: defaultStudentState,
      events: [],
    });

    return Response.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Reset failed";

    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();

    const parseList = (value: unknown) =>
      Array.isArray(value)
        ? value.map((item) => String(item).trim()).filter(Boolean)
        : undefined;

    const updated = await updateState((state) => ({
      ...state,
      profile: {
        ...state.profile,
        name: typeof body.name === "string" ? body.name.trim() : state.profile.name,
        grade: Number.isFinite(Number(body.grade)) ? Number(body.grade) : state.profile.grade,
        school: typeof body.school === "string" ? body.school.trim() : state.profile.school,
        semesterGoal: Number.isFinite(Number(body.semesterGoal))
          ? Number(body.semesterGoal)
          : state.profile.semesterGoal,
        subjects: parseList(body.subjects) || state.profile.subjects,
        goals: parseList(body.goals) || state.profile.goals,
        preferredStudyStyle:
          body.preferredStudyStyle === "flashcards" ||
          body.preferredStudyStyle === "practice-problems" ||
          body.preferredStudyStyle === "summaries" ||
          body.preferredStudyStyle === "videos" ||
          body.preferredStudyStyle === "teaching-back"
            ? body.preferredStudyStyle
            : state.profile.preferredStudyStyle,
        availableHoursPerWeek: Number.isFinite(Number(body.availableHoursPerWeek))
          ? Number(body.availableHoursPerWeek)
          : state.profile.availableHoursPerWeek,
        extracurriculars: parseList(body.extracurriculars) || state.profile.extracurriculars,
      },
      memory: {
        ...state.memory,
        preferredStudySessionLength: Number.isFinite(Number(body.preferredStudySessionLength))
          ? Number(body.preferredStudySessionLength)
          : state.memory.preferredStudySessionLength,
        preferredBreakLength: Number.isFinite(Number(body.preferredBreakLength))
          ? Number(body.preferredBreakLength)
          : state.memory.preferredBreakLength,
        burnoutThresholdHours: Number.isFinite(Number(body.burnoutThresholdHours))
          ? Number(body.burnoutThresholdHours)
          : state.memory.burnoutThresholdHours,
        averageEnergyLevel: Number.isFinite(Number(body.averageEnergyLevel))
          ? Number(body.averageEnergyLevel)
          : state.memory.averageEnergyLevel,
      },
      status: {
        ...state.status,
        energyLevel: Number.isFinite(Number(body.energyLevel))
          ? Number(body.energyLevel)
          : state.status.energyLevel,
        focusScore: Number.isFinite(Number(body.focusScore))
          ? Number(body.focusScore)
          : state.status.focusScore,
        stressLevel: Number.isFinite(Number(body.stressLevel))
          ? Number(body.stressLevel)
          : state.status.stressLevel,
        burnoutRisk: Number.isFinite(Number(body.burnoutRisk))
          ? Number(body.burnoutRisk)
          : state.status.burnoutRisk,
      },
    }));

    emitDomainEvent("status.energy.updated", {
      energyLevel: updated.status.energyLevel,
      focusScore: updated.status.focusScore,
      stressLevel: updated.status.stressLevel,
      burnoutRisk: updated.status.burnoutRisk,
    });
    emitDomainEvent("mission.regeneration.requested", {
      reason: "Profile or status changed",
    });

    return Response.json({
      profile: updated.profile,
      memory: updated.memory,
      status: updated.status,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Profile update failed";

    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
}
