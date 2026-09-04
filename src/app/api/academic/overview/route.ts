import { buildAcademicAnalytics } from "@/lib/academic-analytics";
import { deriveCourses, deriveNotifications } from "@/lib/academic-graph";
import { getState } from "@/lib/server-state";

export async function GET() {
  try {
  const state = await getState();

  return Response.json({
    profile: state.profile,
    status: state.status,
    grades: state.grades,
    memory: state.memory,
    courses: deriveCourses({
      profile: state.profile,
      assignments: state.assignments,
      documents: state.documents,
      grades: state.grades,
      studySessions: state.studySessions,
      memory: state.memory,
    }),
    notifications: deriveNotifications({
      assignments: state.assignments,
      grades: state.grades,
      documents: state.documents,
      studySessions: state.studySessions,
    }),
    analytics: buildAcademicAnalytics({
      assignments: state.assignments,
      grades: state.grades,
      memory: state.memory,
      mission: state.currentMission,
    }),
    currentMission: state.currentMission,
    missionHistory: state.missionHistory.slice(0, 10),
    integrations: state.integrations,
    academicSignals: state.academicSignals,
    dailyBriefings: state.dailyBriefings.slice(0, 5),
  });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Academic overview load failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
