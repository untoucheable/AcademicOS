"use client";

import { useCallback, useEffect, useState } from "react";
import { Brain, Goal, NotebookPen, RefreshCw, Sparkles, TimerReset, TrendingDown, TrendingUp } from "lucide-react";
import { Header } from "@/components/header";
import { useApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingScreen } from "@/components/ui/loading";
import { Textarea } from "@/components/ui/textarea";
import { calculateGradeAverage } from "@/lib/academic-analytics";
import type { AnalyticsInsight } from "@/lib/types";

function formatHours(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function AnalyticsPageContent() {
  const {
    isLoaded,
    profile,
    grades,
    courses,
    notifications,
    memory,
    studySessions,
    reflections,
    goals,
    addStudySession,
    addReflection,
    addGoal,
    updateGoal,
    analyticsInsight,
    refreshState,
  } = useApp();
  const [sessionForm, setSessionForm] = useState({
    subject: "",
    durationMinutes: "45",
    productivity: "7",
    notes: "",
  });
  const [goalForm, setGoalForm] = useState({
    title: "",
    targetDate: "",
    notes: "",
  });
  const [reflectionForm, setReflectionForm] = useState({
    prompt: "What went well today?",
    response: "",
  });
  const [insight, setInsight] = useState<AnalyticsInsight | null>(analyticsInsight);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState("");

  useEffect(() => {
    setInsight(analyticsInsight);
  }, [analyticsInsight]);

  const totalFocusMinutes = studySessions.reduce((total, session) => total + session.durationMinutes, 0);
  const weeklyGoalMinutes = Math.max(1, profile.availableHoursPerWeek * 60);
  const focusProgress = Math.min(100, Math.round((totalFocusMinutes / weeklyGoalMinutes) * 100));
  const activeAssignments = courses.reduce((total, course) => total + course.assignmentCount, 0);
  const deadlineDensity = notifications.filter((notification) => notification.level === "warning").length;
  const gradeAverages = grades
    .map((grade) => ({
      subject: grade.subject,
      average: calculateGradeAverage(grade),
      target: grade.targetAverage,
    }))
    .sort((a, b) => a.average - b.average);
  const weakest = gradeAverages[0];
  const strongest = [...gradeAverages].sort((a, b) => b.average - a.average)[0];

  function submitStudySession() {
    if (!sessionForm.subject.trim()) return;
    addStudySession({
      subject: sessionForm.subject.trim(),
      durationMinutes: Number(sessionForm.durationMinutes) || 45,
      productivity: Number(sessionForm.productivity) || 7,
      notes: sessionForm.notes.trim() || undefined,
    });
    setSessionForm({
      subject: "",
      durationMinutes: "45",
      productivity: "7",
      notes: "",
    });
  }

  function submitGoal() {
    if (!goalForm.title.trim()) return;
    addGoal({
      title: goalForm.title.trim(),
      targetDate: goalForm.targetDate || undefined,
      notes: goalForm.notes.trim() || undefined,
      progress: 0,
    });
    setGoalForm({ title: "", targetDate: "", notes: "" });
  }

  function submitReflection() {
    if (!reflectionForm.response.trim()) return;
    addReflection({
      prompt: reflectionForm.prompt.trim(),
      response: reflectionForm.response.trim(),
    });
    setReflectionForm({ prompt: "What went well today?", response: "" });
  }

  const refreshInsight = useCallback(async (force: boolean) => {
    setInsightLoading(true);
    setInsightError("");

    try {
      const response = await fetch("/api/analytics/insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ force }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Analytics insight could not be generated.");
      }

      setInsight(data.insight || null);
      await refreshState();
    } catch (err) {
      setInsightError(err instanceof Error ? err.message : "Analytics insight could not be generated.");
    } finally {
      setInsightLoading(false);
    }
  }, [refreshState]);

  useEffect(() => {
    if (!isLoaded) return;
    if (analyticsInsight) return;

    void refreshInsight(false);
  }, [analyticsInsight, isLoaded, refreshInsight]);

  if (!isLoaded) return <LoadingScreen />;

  return (
    <>
      <Header
        title="Analytics"
        description="Track grades, focus time, goals, and end-of-day reflection in one place."
        action={
          <Button variant="secondary" onClick={() => void refreshInsight(true)} disabled={insightLoading}>
            <RefreshCw className={`h-4 w-4 ${insightLoading ? "animate-spin" : ""}`} />
            Refresh AI Insight
          </Button>
        }
      />

      <main className="space-y-6 p-6">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent" />
                <h2 className="font-semibold">AI Weekly Read</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                A plain-language read on what matters most over the next few days.
              </p>
            </div>
            {insight?.generatedAt ? (
              <Badge variant={insight.source === "ai" ? "accent" : "warning"}>
                {insight.source === "ai" ? "AI" : "Data-based"} · {new Date(insight.generatedAt).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </Badge>
            ) : null}
          </div>

          {insightError ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {insightError}
            </div>
          ) : null}

          {insight ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">Summary</p>
                <p className="mt-2 text-sm">{insight.summary}</p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">Weekly Outlook</p>
                <p className="mt-2 text-sm">{insight.weeklyOutlook}</p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">Burnout Advice</p>
                <p className="mt-2 text-sm">{insight.burnoutAdvice}</p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4 lg:col-span-3">
                <p className="text-xs font-medium uppercase text-muted-foreground">Top Priorities</p>
                <ul className="mt-2 space-y-2 text-sm">
                  {insight.topPriorities.map((priority) => (
                    <li key={priority}>{priority}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              {insightLoading ? "Building your AI read..." : "Refresh AI Insight to generate a weekly read."}
            </p>
          )}
        </Card>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-muted">
              <TimerReset className="h-5 w-5 text-accent" />
            </div>
            <p className="mt-4 text-2xl font-semibold">{formatHours(totalFocusMinutes)}</p>
            <p className="text-sm font-medium">Study Time</p>
            <p className="mt-1 text-xs text-muted-foreground">Matches your stored weekly availability.</p>
          </Card>
          <Card>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            </div>
            <p className="mt-4 text-2xl font-semibold">{strongest?.subject || "None"}</p>
            <p className="text-sm font-medium">Strongest Subject</p>
            <p className="mt-1 text-xs text-muted-foreground">{strongest ? `${strongest.average}%` : "Add grades to unlock"}</p>
          </Card>
          <Card>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10">
              <TrendingDown className="h-5 w-5 text-red-600" />
            </div>
            <p className="mt-4 text-2xl font-semibold">{weakest?.subject || "None"}</p>
            <p className="text-sm font-medium">Needs Focus</p>
            <p className="mt-1 text-xs text-muted-foreground">{weakest ? `${weakest.average}% current average` : "Add grades to unlock"}</p>
          </Card>
          <Card>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
              <Brain className="h-5 w-5 text-blue-600" />
            </div>
            <p className="mt-4 text-2xl font-semibold">{focusProgress}%</p>
            <p className="text-sm font-medium">Weekly Goal Progress</p>
            <p className="mt-1 text-xs text-muted-foreground">{profile.availableHoursPerWeek}h target</p>
          </Card>
          <Card>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10">
              <TrendingUp className="h-5 w-5 text-violet-600" />
            </div>
            <p className="mt-4 text-2xl font-semibold">{courses.length}</p>
            <p className="text-sm font-medium">Tracked Courses</p>
            <p className="mt-1 text-xs text-muted-foreground">{activeAssignments} active tasks across subjects.</p>
          </Card>
          <Card>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
              <Goal className="h-5 w-5 text-amber-600" />
            </div>
            <p className="mt-4 text-2xl font-semibold">{deadlineDensity}</p>
            <p className="text-sm font-medium">Deadline Alerts</p>
            <p className="mt-1 text-xs text-muted-foreground">Upcoming work needing attention soon.</p>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[360px_1fr]">
          <Card>
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold">Long-Term Goals</h2>
            </div>
            <div className="space-y-3">
              <Input
                label="Goal"
                value={goalForm.title}
                onChange={(e) => setGoalForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder='Get a 95 average'
              />
              <Input
                label="Target Date"
                type="date"
                value={goalForm.targetDate}
                onChange={(e) => setGoalForm((prev) => ({ ...prev, targetDate: e.target.value }))}
              />
              <Textarea
                label="Notes"
                value={goalForm.notes}
                onChange={(e) => setGoalForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Why this goal matters"
              />
              <Button className="w-full" onClick={submitGoal}>
                <Goal className="h-4 w-4" />
                Add Goal
              </Button>
            </div>

            <div className="mt-6 space-y-3">
              {goals.length ? goals.map((goal) => (
                <div key={goal.id} className="rounded-lg border border-border bg-background p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{goal.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {goal.targetDate ? `Due ${goal.targetDate}` : "No due date"}
                      </p>
                    </div>
                    <Badge variant={goal.progress >= 75 ? "success" : goal.progress >= 25 ? "warning" : "accent"}>
                      {goal.progress}%
                    </Badge>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${goal.progress}%` }} />
                  </div>
                  <button
                    type="button"
                    className="mt-3 text-xs font-medium text-accent hover:underline"
                    onClick={() => updateGoal(goal.id, { progress: Math.min(100, goal.progress + 10) })}
                  >
                    +10% progress
                  </button>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground">Add a long-term goal to build a roadmap.</p>
              )}
            </div>
          </Card>

          <div className="space-y-6">
            <Card>
              <div className="mb-4 flex items-center gap-2">
                <NotebookPen className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-semibold">Study Session Tracking</h2>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  label="Subject"
                  value={sessionForm.subject}
                  onChange={(e) => setSessionForm((prev) => ({ ...prev, subject: e.target.value }))}
                  placeholder="Biology"
                />
                <Input
                  label="Duration (min)"
                  type="number"
                  value={sessionForm.durationMinutes}
                  onChange={(e) => setSessionForm((prev) => ({ ...prev, durationMinutes: e.target.value }))}
                />
                <Input
                  label="Productivity (1-10)"
                  type="number"
                  value={sessionForm.productivity}
                  onChange={(e) => setSessionForm((prev) => ({ ...prev, productivity: e.target.value }))}
                />
                <div />
              </div>
              <Textarea
                className="mt-3"
                label="Notes"
                value={sessionForm.notes}
                onChange={(e) => setSessionForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="What worked well or felt hard?"
              />
              <Button className="mt-4" onClick={submitStudySession}>
                Log Session
              </Button>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {studySessions.slice(0, 3).map((session) => (
                  <div key={session.id} className="rounded-lg border border-border bg-background p-3">
                    <p className="font-medium">{session.subject}</p>
                    <p className="text-sm text-muted-foreground">{session.durationMinutes} minutes</p>
                    <p className="text-xs text-muted-foreground">Productivity {session.productivity}/10</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <div className="mb-4 flex items-center gap-2">
                <Brain className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-semibold">Reflection</h2>
              </div>
              <Input
                label="Prompt"
                value={reflectionForm.prompt}
                onChange={(e) => setReflectionForm((prev) => ({ ...prev, prompt: e.target.value }))}
              />
              <Textarea
                className="mt-3"
                label="Response"
                value={reflectionForm.response}
                onChange={(e) => setReflectionForm((prev) => ({ ...prev, response: e.target.value }))}
                placeholder="How productive was today? What should change tomorrow?"
              />
              <Button className="mt-4" onClick={submitReflection}>
                Save Reflection
              </Button>

              <div className="mt-5 space-y-3">
                {reflections.slice(0, 3).map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-border bg-background p-3">
                    <p className="text-sm font-medium">{entry.prompt}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{entry.response}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <div className="mb-4 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-semibold">Memory Snapshot</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Best Time</p>
                  <p className="mt-1 text-sm">{memory.dailyPatterns[0]?.timeOfDay || "morning"}</p>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Hardest Subject</p>
                  <p className="mt-1 text-sm">{memory.hardestSubject || "None yet"}</p>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Session Length</p>
                  <p className="mt-1 text-sm">{memory.preferredStudySessionLength}m</p>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Burnout Threshold</p>
                  <p className="mt-1 text-sm">{memory.burnoutThresholdHours}h</p>
                </div>
              </div>
            </Card>
          </div>
        </section>
      </main>
    </>
  );
}
