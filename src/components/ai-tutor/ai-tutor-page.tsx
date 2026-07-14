"use client";

import { useEffect, useState } from "react";
import { Bot, Send, Sparkles } from "lucide-react";
import { Header } from "@/components/header";
import { useApp } from "@/components/providers/app-provider";
import { getInitials } from "@/lib/date";
import { LoadingScreen } from "@/components/ui/loading";

const suggestions = [
  "Summarize my lecture notes on thermodynamics",
  "Help me outline my research paper",
  "Explain recursion with examples",
  "Create a study schedule for finals week",
];

type Message = {
  role: "user" | "assistant";
  content: string;
};

export function AiTutorPageContent() {
  const { settings, profile, grades, goals, assignments, documents, isLoaded } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const topGoal = goals[0]?.title || "Improve my grades";
  const weakestSubject =
    [...grades].sort((a, b) => a.currentAverage - b.currentAverage)[0]?.subject ||
    "one of my weak subjects";

  useEffect(() => {
    if (isLoaded) {
      setMessages([
        {
          role: "assistant",
          content: `Hi ${settings.username}! I'm your AcademicOS AI Tutor. I know your study style is ${profile.preferredStudyStyle.replace("-", " ")} and your current focus is ${topGoal}. I can help with homework, study planning, assignment breakdowns, grade improvement, and explaining complex topics. What would you like to work on?`,
        },
      ]);
    }
  }, [isLoaded, settings.username, profile.preferredStudyStyle, topGoal]);

  if (!isLoaded) return <LoadingScreen />;

  function handleSend(text: string) {
    if (!text.trim()) return;
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text },
      {
        role: "assistant",
        content:
          "I'm a local tutor in AcademicOS. Connect an AI provider to enable real responses. Your assignments, notes, and calendar context are available inside the app.",
      },
    ]);
    setInput("");
  }

  return (
    <>
      <Header
        title="AI Tutor"
        description="Ask in context with your assignments, notes, grades, and calendar."
      />

      <main className="flex h-[calc(100vh-4rem)] flex-col p-6">
        <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex-1 space-y-4 overflow-y-auto p-6">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    msg.role === "assistant"
                      ? "bg-accent text-accent-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <Bot className="h-4 w-4" />
                  ) : (
                    <span className="text-xs font-semibold">{getInitials(settings.username) || "?"}</span>
                  )}
                </div>
                <div
                  className={`max-w-[75%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "assistant"
                      ? "bg-muted text-foreground"
                      : "bg-accent text-accent-foreground"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
          </div>

          {messages.length <= 1 && (
            <div className="border-t border-border px-6 py-4">
              <p className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                Suggested prompts
              </p>
              <div className="flex flex-wrap gap-2">
                {[...suggestions, `Help me improve ${weakestSubject}`, `Plan time for ${topGoal}`].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSend(s)}
                    className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent/30 hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-border px-6 py-4">
            <div className="mb-3 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-xs font-medium uppercase text-muted-foreground">Assignments</p>
                <p className="mt-1 text-sm">{assignments.length}</p>
              </div>
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-xs font-medium uppercase text-muted-foreground">Documents</p>
                <p className="mt-1 text-sm">{documents.length}</p>
              </div>
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-xs font-medium uppercase text-muted-foreground">Goals</p>
                <p className="mt-1 text-sm">{goals.length}</p>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend(input);
              }}
            >
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask anything about your coursework..."
                  className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
                <button
                  type="submit"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-colors hover:bg-accent/90"
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </>
  );
}
