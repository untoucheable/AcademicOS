import OpenAI from "openai";

import { buildAcademicAnalytics } from "@/lib/academic-analytics";
import { getState, updateState } from "@/lib/server-state";
import type { AnalyticsInsight } from "@/lib/types";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const ANALYTICS_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const ANALYTICS_MAX_OUTPUT_TOKENS = 1500;
const CACHE_WINDOW_MS = 6 * 60 * 60 * 1000;

function parseAnalyticsJson(raw: string) {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const rawText = fenced ? fenced[1].trim() : trimmed;

  try {
    return JSON.parse(rawText) as Omit<AnalyticsInsight, "generatedAt" | "source">;
  } catch {
    const objectStart = rawText.indexOf("{");
    const arrayStart = rawText.indexOf("[");
    const startCandidates = [objectStart, arrayStart].filter((value) => value >= 0);
    const jsonStart = startCandidates.length ? Math.min(...startCandidates) : -1;

    if (jsonStart < 0) {
      throw new Error("Analytics insight response was not valid JSON.");
    }

    const sliced = rawText.slice(jsonStart).trim();
    const objectEnd = sliced.lastIndexOf("}");
    const arrayEnd = sliced.lastIndexOf("]");
    const endCandidates = [objectEnd, arrayEnd].filter((value) => value >= 0);
    const jsonEnd = endCandidates.length ? Math.max(...endCandidates) : -1;

    if (jsonEnd < 0) {
      throw new Error("Analytics insight response was not valid JSON.");
    }

    return JSON.parse(sliced.slice(0, jsonEnd + 1)) as Omit<AnalyticsInsight, "generatedAt" | "source">;
  }
}

function parseAnalyticsText(raw: string) {
  const cleaned = raw.trim();
  const section = (label: string, nextLabels: string[]) => {
    const next = nextLabels.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const match = cleaned.match(new RegExp(`(?:^|\\n)${label}:?\\s*([\\s\\S]*?)(?=\\n(?:${next}):?|$)`, "i"));
    return match?.[1].trim() || "";
  };

  const summary = section("Summary", ["Weekly Outlook", "Burnout Advice", "Top Priorities"]);
  const weeklyOutlook = section("Weekly Outlook", ["Burnout Advice", "Top Priorities"]);
  const burnoutAdvice = section("Burnout Advice", ["Top Priorities"]);
  const prioritiesSection = section("Top Priorities", []);
  const topPriorities = prioritiesSection
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 3);

  if (!summary || !weeklyOutlook || !burnoutAdvice || !topPriorities.length) {
    throw new Error("Analytics response did not contain all required sections.");
  }

  return { summary, weeklyOutlook, burnoutAdvice, topPriorities };
}

function buildDataBasedInsight(analytics: ReturnType<typeof buildAcademicAnalytics>): AnalyticsInsight {
  const topItems = analytics.priorityScores.slice(0, 3);
  const topPriorities = topItems.length
    ? topItems.map((item) => `Prioritize ${item.title}${item.subject ? ` for ${item.subject}` : ""}.`)
    : ["Add upcoming assignments so AcademicOS can prioritize your week."];
  const weakSubject = analytics.weakestSubject?.subject;
  const strongestSubject = analytics.strongestSubject?.subject;
  const deadlineSentence = analytics.overdueAssignments > 0
    ? `${analytics.overdueAssignments} item${analytics.overdueAssignments === 1 ? " is" : "s are"} overdue.`
    : analytics.dueSoonAssignments > 0
      ? `${analytics.dueSoonAssignments} item${analytics.dueSoonAssignments === 1 ? " is" : "s are"} due within three days.`
      : "No active deadline is within the next three days.";

  return {
    summary: `${analytics.activeAssignments} active assignment${analytics.activeAssignments === 1 ? "" : "s"}, ${analytics.workloadMinutes} minutes of estimated work, and ${deadlineSentence}`,
    weeklyOutlook: analytics.scheduledStudyMinutes < analytics.workloadMinutes
      ? `Your Mission currently covers ${analytics.scheduledStudyMinutes} of ${analytics.workloadMinutes} estimated work minutes. Start with the top priority items before optional work.${weakSubject ? ` Give ${weakSubject} extra attention where possible.` : ""}`
      : `Your current Mission covers the tracked workload. Keep the schedule steady and protect sleep.${strongestSubject ? ` ${strongestSubject} is currently your strongest recorded subject.` : ""}`,
    burnoutAdvice: analytics.burnoutRisk === "high"
      ? "Workload pressure is high. Complete the most urgent work first, use short breaks between focused blocks, and keep optional tasks out of tonight."
      : analytics.burnoutRisk === "medium"
        ? "Use focused blocks with breaks and avoid turning free time into extra work unless a due date requires it."
        : "Your tracked workload is currently manageable. Keep sleep protected and begin due-soon work before it becomes urgent.",
    topPriorities,
    generatedAt: new Date().toISOString(),
    source: "deterministic",
  };
}

export async function GET() {
  const state = getState();

  return Response.json({
    insight: state.analyticsInsight,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const force = body.force === true;
    const state = getState();
    const existing = state.analyticsInsight;

    if (
      !force &&
      existing?.generatedAt &&
      Date.now() - new Date(existing.generatedAt).getTime() < CACHE_WINDOW_MS
    ) {
      return Response.json({
        insight: existing,
        cached: true,
      });
    }

    const analytics = buildAcademicAnalytics({
      assignments: state.assignments,
      grades: state.grades,
      memory: state.memory,
      mission: state.currentMission,
    });

    const context = {
      status: state.status,
      profile: {
        subjects: state.profile.subjects,
        availableHoursPerWeek: state.profile.availableHoursPerWeek,
        preferredStudyStyle: state.profile.preferredStudyStyle,
      },
      analytics: {
        activeAssignments: analytics.activeAssignments,
        overdueAssignments: analytics.overdueAssignments,
        dueSoonAssignments: analytics.dueSoonAssignments,
        workloadMinutes: analytics.workloadMinutes,
        scheduledStudyMinutes: analytics.scheduledStudyMinutes,
        burnoutRisk: analytics.burnoutRisk,
        weakestSubject: analytics.weakestSubject,
        strongestSubject: analytics.strongestSubject,
        topPriorityScores: analytics.priorityScores.slice(0, 5),
      },
      mission: state.currentMission
        ? {
            summary: state.currentMission.summary,
            energyLevel: state.currentMission.energyLevel,
            burnoutRisk: state.currentMission.burnoutRisk,
            focusScore: state.currentMission.focusScore,
          }
        : null,
      recentReflections: state.reflections.slice(-3).map((entry) => ({
        prompt: entry.prompt,
        response: entry.response,
      })),
      recentStudySessions: state.studySessions.slice(-5).map((session) => ({
        subject: session.subject,
        durationMinutes: session.durationMinutes,
        productivity: session.productivity,
      })),
    };

    let insight = buildDataBasedInsight(analytics);

    if (process.env.OPENROUTER_API_KEY) {
      try {
        const completion = await client.chat.completions.create({
          model: ANALYTICS_MODEL,
          max_tokens: ANALYTICS_MAX_OUTPUT_TOKENS,
          messages: [
            {
              role: "system",
              content: "You are AcademicOS Analytics. Use only the supplied student data. Return exactly these four plain-text sections, each with useful content: Summary:, Weekly Outlook:, Burnout Advice:, and Top Priorities:. Under Top Priorities, give exactly three short bullet points. Be concrete, do not invent facts, and explain the next few days in plain language. Do not return JSON, markdown fences, safety labels, or any introduction.",
            },
            {
              role: "user",
              content: JSON.stringify(context),
            },
          ],
        });

        const raw = completion.choices[0]?.message?.content?.trim() || "";
        const parsed = raw.trim().startsWith("{")
          ? parseAnalyticsJson(raw)
          : parseAnalyticsText(raw);
        if (
          !parsed ||
          typeof parsed.summary !== "string" ||
          typeof parsed.weeklyOutlook !== "string" ||
          typeof parsed.burnoutAdvice !== "string"
        ) {
          throw new Error("Analytics insight response did not contain the required fields.");
        }
        insight = {
          summary: parsed.summary,
          weeklyOutlook: parsed.weeklyOutlook,
          burnoutAdvice: parsed.burnoutAdvice,
          topPriorities: Array.isArray(parsed.topPriorities) ? parsed.topPriorities.slice(0, 3) : [],
          generatedAt: new Date().toISOString(),
          source: "ai",
        };
      } catch {
        insight = buildDataBasedInsight(analytics);
      }
    }

    const updated = updateState((current) => ({
      ...current,
      analyticsInsight: insight,
    }));

    return Response.json({
      insight: updated.analyticsInsight,
      cached: false,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Analytics insight generation failed.";

    return Response.json(
      { error: message },
      { status: 500 },
    );
  }
}
