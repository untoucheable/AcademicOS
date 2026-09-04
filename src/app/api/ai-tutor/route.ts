import crypto from "node:crypto";

import OpenAI from "openai";

import { getState, updateState } from "@/lib/server-state";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const TUTOR_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const TUTOR_FALLBACK_MODEL = process.env.OPENROUTER_FALLBACK_MODEL || "openrouter/free";
const TUTOR_MAX_OUTPUT_TOKENS = 1500;

function buildFallbackReply() {
  return "I couldn't reach the AI service just now, but your saved assignments, grades, documents, and mission are still here. Try again in a moment.";
}

function getProviderErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") return { status: undefined, message: "Unknown provider error" };
  const candidate = error as { status?: unknown; message?: unknown };
  return {
    status: typeof candidate.status === "number" ? candidate.status : undefined,
    message: typeof candidate.message === "string" ? candidate.message : "Unknown provider error",
  };
}

function shouldTryFallbackModel(error: unknown) {
  const { status, message } = getProviderErrorDetails(error);
  const normalizedMessage = message.toLowerCase();
  return [402, 408, 409, 429, 500, 502, 503, 504].includes(status || 0)
    || normalizedMessage.includes("provider")
    || normalizedMessage.includes("temporar")
    || normalizedMessage.includes("unavailable")
    || normalizedMessage.includes("timeout")
    || normalizedMessage.includes("credit")
    || normalizedMessage.includes("insufficient");
}

function documentSearchTerms(message: string) {
  return new Set(
    message.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g)?.filter((word) => !new Set([
      "about", "could", "explain", "help", "need", "that", "this", "with", "what", "your",
    ]).has(word)) || [],
  );
}

function buildTutorDocuments(message: string, documents: ReturnType<typeof getState>["documents"]) {
  const terms = documentSearchTerms(message);

  return [...documents]
    .map((document) => {
      const searchable = `${document.title} ${document.subject || ""} ${(document.tags || []).join(" ")} ${document.content || ""}`.toLowerCase();
      const relevance = [...terms].reduce((score, term) => score + (searchable.includes(term) ? 1 : 0), 0);

      return { document, relevance };
    })
    .sort((a, b) => b.relevance - a.relevance || (b.document.lastUsedAt || b.document.uploadedAt).localeCompare(a.document.lastUsedAt || a.document.uploadedAt))
    .slice(0, 4)
    .map(({ document }) => ({
      title: document.title,
      subject: document.subject,
      type: document.type,
      tags: document.tags || [],
      // Keep the prompt small while providing the actual notes the student asked about.
      excerpt: (document.content || "").replace(/\s+/g, " ").trim().slice(0, 1800),
    }));
}

export async function GET() {
  const state = getState();

  return Response.json({
    messages: state.tutorMessages || [],
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!message) {
      return Response.json(
        { error: "message is required." },
        { status: 400 },
      );
    }

    const state = getState();
    const userMessage = {
      id: `tutor:${crypto.randomUUID()}`,
      role: "user" as const,
      content: message,
      createdAt: new Date().toISOString(),
    };
    const context = {
      assignments: state.assignments
        .filter((assignment) => !assignment.completed)
        .slice(0, 6)
        .map((assignment) => ({
          title: assignment.title,
          course: assignment.course,
          type: assignment.assessmentType,
          dueDate: assignment.dueDate,
          priority: assignment.priority,
          estimatedMinutes: assignment.estimatedMinutes,
          progress: assignment.progress?.percentComplete,
          studyMinutesCompleted: assignment.progress?.studyMinutesCompleted,
        })),
      grades: state.grades.slice(0, 6).map((grade) => ({
        subject: grade.subject,
        currentAverage: grade.currentAverage,
        targetAverage: grade.targetAverage,
      })),
      documents: buildTutorDocuments(message, state.documents),
      documentLibrary: state.documents.map((document) => ({
        title: document.title,
        subject: document.subject,
        type: document.type,
      })).slice(0, 30),
      calendar: state.calendar
        .filter((event) => new Date(event.endTime).getTime() >= Date.now())
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
        .slice(0, 12)
        .map((event) => ({ title: event.title, type: event.type, startTime: event.startTime, endTime: event.endTime })),
      profile: {
        subjects: state.profile.subjects,
        preferredStudyStyle: state.profile.preferredStudyStyle,
      },
      currentMission: state.currentMission
        ? {
            summary: state.currentMission.summary,
            schedule: state.currentMission.schedule.slice(0, 10).map((event) => ({
              title: event.title,
              startTime: event.startTime,
              endTime: event.endTime,
            })),
          }
        : null,
    };
    const priorMessages = [...(state.tutorMessages || []), userMessage].slice(-10);
    let reply = buildFallbackReply();

    if (process.env.OPENROUTER_API_KEY) {
      const messages = [
        {
          role: "system" as const,
          content: "You are AcademicOS AI Tutor. Give practical, accurate, encouraging help using the provided student context. The documents field contains actual note excerpts, and documentLibrary identifies the rest of the saved library. Use document excerpts directly when they answer the question. Never claim that you cannot access the student's documents when an excerpt or relevant library item is present. If a document's full text is not included, say which saved document would be useful and ask the student to open or paste the relevant section. Keep answers concise unless the student asks for more detail.",
        },
        {
          role: "user" as const,
          content: JSON.stringify({
            context,
            conversation: priorMessages.map((entry) => ({
              role: entry.role,
              content: entry.content,
            })),
          }),
        },
      ];
      try {
        const completion = await client.chat.completions.create({
          model: TUTOR_MODEL,
          max_tokens: TUTOR_MAX_OUTPUT_TOKENS,
          messages,
        });

        reply = completion.choices[0]?.message?.content?.trim() || buildFallbackReply();
      } catch (primaryError) {
        const primaryDetails = getProviderErrorDetails(primaryError);
        console.error("AcademicOS Tutor primary AI request failed", {
          model: TUTOR_MODEL,
          status: primaryDetails.status,
          message: primaryDetails.message,
        });

        if (TUTOR_FALLBACK_MODEL !== TUTOR_MODEL && shouldTryFallbackModel(primaryError)) {
          try {
            const completion = await client.chat.completions.create({
              model: TUTOR_FALLBACK_MODEL,
              max_tokens: Math.min(TUTOR_MAX_OUTPUT_TOKENS, 1200),
              messages,
            });
            reply = completion.choices[0]?.message?.content?.trim() || buildFallbackReply();
          } catch (fallbackError) {
            const fallbackDetails = getProviderErrorDetails(fallbackError);
            console.error("AcademicOS Tutor fallback AI request failed", {
              model: TUTOR_FALLBACK_MODEL,
              status: fallbackDetails.status,
              message: fallbackDetails.message,
            });
          }
        }
      }
    }

    const assistantMessage = {
      id: `tutor:${crypto.randomUUID()}`,
      role: "assistant" as const,
      content: reply,
      createdAt: new Date().toISOString(),
    };

    const updated = updateState((current) => ({
      ...current,
      tutorMessages: [...(current.tutorMessages || []), userMessage, assistantMessage].slice(-40),
    }));

    return Response.json({
      messages: updated.tutorMessages,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "AI Tutor request failed.";

    return Response.json(
      { error: message },
      { status: 500 },
    );
  }
}
