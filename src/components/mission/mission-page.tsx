"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CalendarDays, Flame, RefreshCw, Sparkles, Timer } from "lucide-react";
import { Header } from "@/components/header";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingScreen } from "@/components/ui/loading";
import { Modal } from "@/components/ui/modal";
import { Mission, sortMissionSchedule } from "@/lib/mission";
import {
  buildDailyPlanEvents,
  buildDailyPlanPreview,
  getDailyPlanTemplates,
  getDefaultDailyPlanTemplateId,
} from "@/lib/daily-plans";
import type { DailyMissionPlan, DailyPlanTemplateId, EnergyLevel } from "@/lib/types";

type ReviewItem = {
  id: string;
  title: string;
  reason: string;
  confidence: {
    score: number;
    reason: string;
    needsConfirmation: boolean;
  };
};

function toLocalISOString(date: Date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absoluteOffset / 60)).padStart(2, "0");
  const offsetMins = String(absoluteOffset % 60).padStart(2, "0");
  const pad = (value: number) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
    ":",
    pad(date.getSeconds()),
    offsetSign,
    offsetHours,
    ":",
    offsetMins,
  ].join("");
}

export function MissionPageContent() {
  const { isLoaded, dailyMissionPlan, currentMission, setDailyMissionPlan } = useApp();
  const [input, setInput] = useState("");
  const [mission, setMission] = useState<Mission | null>(null);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [hideTarget, setHideTarget] = useState<{ id: string; title: string } | null>(null);
  const [planPromptOpen, setPlanPromptOpen] = useState(false);
  const [majorUpdates, setMajorUpdates] = useState("");
  const [energyLevel, setEnergyLevel] = useState<EnergyLevel>("medium");
  const [templateId, setTemplateId] = useState<DailyPlanTemplateId>("training-day");
  const hasLoadedInitialMission = useRef(false);
  const todayKey = useMemo(() => toLocalISOString(new Date()).slice(0, 10), []);
  const orderedSchedule = sortMissionSchedule(mission?.schedule || []);
  const planPreview = useMemo(() => buildDailyPlanPreview(dailyMissionPlan), [dailyMissionPlan]);
  const basePlanEvents = useMemo(
    () => buildDailyPlanEvents(dailyMissionPlan, toLocalISOString(new Date())),
    [dailyMissionPlan],
  );
  const displaySchedule = orderedSchedule.length ? orderedSchedule : basePlanEvents;
  const templateOptions = useMemo(() => getDailyPlanTemplates(), []);

  useEffect(() => {
    if (currentMission) {
      setMission(currentMission);
    }
  }, [currentMission]);

  const loadReviewItems = useCallback(async () => {
    const res = await fetch("/api/review");
    const data = await res.json();

    if (res.ok) {
      setReviewItems(data.items || []);
    }
  }, []);

  const generateMission = useCallback(async (context: string) => {
    setIsLoading(true);
    setError("");
    const now = new Date();

    try {
      const res = await fetch("/api/mission", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: context,
          currentTime: toLocalISOString(now),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Mission generation failed.");
      }

      setMission(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mission generation failed.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    void loadReviewItems();
  }, [isLoaded, loadReviewItems]);

  useEffect(() => {
    if (!isLoaded) return;
    if (hasLoadedInitialMission.current) return;

    setMajorUpdates(dailyMissionPlan?.majorUpdates || "");
    setEnergyLevel(dailyMissionPlan?.energyLevel || "medium");
    setTemplateId(
      dailyMissionPlan?.templateId || getDefaultDailyPlanTemplateId(dailyMissionPlan?.energyLevel),
    );
    setPlanPromptOpen(true);
  }, [dailyMissionPlan, generateMission, isLoaded, todayKey]);

  async function handleSubmit() {
    await generateMission(input);
    setInput("");
  }

  async function handleReviewAction(reviewId: string, action: "approve" | "dismiss") {
    setIsLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/review/${reviewId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Review action failed.");
      }

      setReviewItems(data.items || []);

      if (action === "approve") {
        await generateMission("Approved a detected academic item. Rebuild today's mission from confirmed academic data.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review action failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRemoveEvent(eventId: string) {
    setIsLoading(true);
    setError("");

    try {
      const res = await fetch("/api/mission", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "hide-mission-item", eventId }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Mission update failed.");
      }

      if (data.currentMission) {
        setMission(data.currentMission);
      } else {
        await generateMission(input);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mission update failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleConfirmHide() {
    if (!hideTarget) return;
    await handleRemoveEvent(hideTarget.id);
    setHideTarget(null);
  }

  async function handleSaveDailyPlan() {
    const nextPlan: DailyMissionPlan = {
      date: todayKey,
      templateId,
      energyLevel,
      majorUpdates: majorUpdates.trim(),
      updatedAt: new Date().toISOString(),
    };

    await setDailyMissionPlan(nextPlan);
    setPlanPromptOpen(false);
    hasLoadedInitialMission.current = true;
    await generateMission(nextPlan.majorUpdates);
  }

  async function handleUsePlanWithoutChanges() {
    const nextPlan: DailyMissionPlan = {
      date: todayKey,
      templateId: dailyMissionPlan?.templateId || templateId,
      energyLevel: dailyMissionPlan?.energyLevel || energyLevel,
      majorUpdates: dailyMissionPlan?.majorUpdates || majorUpdates.trim(),
      updatedAt: new Date().toISOString(),
    };

    await setDailyMissionPlan(nextPlan);
    setPlanPromptOpen(false);
    hasLoadedInitialMission.current = true;
    await generateMission(nextPlan.majorUpdates);
  }

  if (!isLoaded || (isLoading && !mission && !planPromptOpen)) return <LoadingScreen />;

  return (
    <>
      <Header
        title="Mission"
        description="The AI planner that turns confirmed events into today's path."
        action={
          <Button variant="secondary" onClick={() => setPlanPromptOpen(true)}>
            <CalendarDays className="h-4 w-4" />
            Edit Day Plan
          </Button>
        }
      />

      <main className="space-y-6 p-6">
        <section className="grid gap-4 md:grid-cols-3">
          <Card>
            <p className="text-xs font-medium uppercase text-muted-foreground">Today&apos;s Plan</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {planPreview ? planPreview.templateName : "Choose a base routine to shape today's plan."}
            </p>
          </Card>
          <Card>
            <p className="text-xs font-medium uppercase text-muted-foreground">Energy Check</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {planPreview
                ? `Today is marked as ${planPreview.energyMode}.`
                : "Tell AcademicOS how much energy you have."}
            </p>
          </Card>
          <Card>
            <p className="text-xs font-medium uppercase text-muted-foreground">Major Updates</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {dailyMissionPlan?.majorUpdates?.trim() || "No major updates saved for today."}
            </p>
          </Card>
        </section>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <article className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-semibold">Today&apos;s Plan</h2>
              <p className="text-sm text-muted-foreground">
                One live plan, shaped from your base routine and today&apos;s edits.
              </p>
            </div>

            {displaySchedule.length ? (
              <ul className="divide-y divide-border">
                {displaySchedule.map((event) => {
                  const isBasePlanEvent = event.id.startsWith("daily-plan:");
                  const isAddedWork = event.source === "ai" && !isBasePlanEvent;
                  const tag = isBasePlanEvent
                    ? "Base block"
                    : isAddedWork
                      ? "Added work"
                      : event.source === "manual"
                        ? "Fixed event"
                        : "Plan item";

                  return (
                    <li key={event.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">{event.title}</p>
                          <p className="text-sm text-muted-foreground">{event.type}</p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {new Date(event.startTime).toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                            {" - "}
                            {new Date(event.endTime).toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className="text-xs font-medium uppercase text-muted-foreground">{tag}</span>
                          <button
                            type="button"
                            onClick={() => setHideTarget({ id: event.id, title: event.title })}
                            disabled={isLoading}
                            className="text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
                          >
                            Hide from Plan
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-5 py-8 text-sm text-muted-foreground">No plan generated yet.</p>
            )}
          </article>

          <div className="space-y-6">
            <article className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="border-b border-border px-5 py-4">
                <h2 className="font-semibold">System Output</h2>
                <p className="text-sm text-muted-foreground">Mission health at a glance.</p>
              </div>
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <div className="rounded-lg border border-border bg-background p-4">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Energy Level</p>
                  <p className="mt-2 text-lg font-semibold">{mission?.energyLevel || "—"}</p>
                </div>
                <div className="rounded-lg border border-border bg-background p-4">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Focus Score</p>
                  <p className="mt-2 text-lg font-semibold">
                    {mission ? `${mission.focusScore}/10` : "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-background p-4">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Expected Finish</p>
                  <p className="mt-2 text-sm font-medium">{mission?.expectedFinishTime || "—"}</p>
                </div>
                <div className="rounded-lg border border-border bg-background p-4">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Burnout Risk</p>
                  <p className="mt-2 text-sm font-medium">{mission ? `${mission.burnoutRisk}/10` : "—"}</p>
                </div>
              </div>
              {mission?.summary ? (
                <p className="border-t border-border px-5 py-4 text-sm text-muted-foreground">
                  {mission.summary}
                </p>
              ) : null}
              {mission?.reason ? (
                <p className="border-t border-border px-5 py-4 text-xs text-muted-foreground">
                  Reason: {mission.reason}
                </p>
              ) : null}
            </article>

            <article className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="border-b border-border px-5 py-4">
                <h2 className="font-semibold">Next Actions</h2>
                <p className="text-sm text-muted-foreground">Fast ways to update the plan.</p>
              </div>
              <div className="flex flex-wrap gap-3 p-5">
                <Link href="/study-tools">
                  <Button>
                    <Timer className="h-4 w-4" />
                    Start Study Session
                  </Button>
                </Link>
                <Button variant="secondary" onClick={() => void generateMission(input)}>
                  <RefreshCw className="h-4 w-4" />
                  Replan
                </Button>
              </div>
            </article>
          </div>
        </section>

        {reviewItems.length ? (
          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-semibold">Needs Confirmation</h2>
              <p className="text-sm text-muted-foreground">
                Review uncertain imported items before applying them.
              </p>
            </div>
            <ul className="divide-y divide-border">
              {reviewItems.map((item) => (
                <li key={item.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{item.title}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{item.reason}</div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        Confidence: {Math.round(item.confidence.score * 100)}%
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleReviewAction(item.id, "approve")}
                        disabled={isLoading}
                        className="text-xs text-green-700 hover:text-green-800 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleReviewAction(item.id, "dismiss")}
                        disabled={isLoading}
                        className="text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-semibold">Quick Update</h2>
            <p className="text-sm text-muted-foreground">Tell the planner what changed.</p>
          </div>
          <div className="space-y-4 p-5">
            <input
              className="w-full rounded-lg border border-border bg-background p-2"
              placeholder="e.g. I'm tired / test moved / soccer today"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void handleSubmit()} disabled={isLoading}>
                Update Mission
              </Button>
              <Link href="/integrations">
                <Button variant="secondary">Manage Integrations</Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Modal
        open={planPromptOpen}
        onClose={() => void handleUsePlanWithoutChanges()}
        title="Edit today's plan"
        description="Tell AcademicOS whether anything major changed, then choose the routine that becomes today's plan."
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Any major updates?</p>
            <textarea
              value={majorUpdates}
              onChange={(e) => setMajorUpdates(e.target.value)}
              className="min-h-24 w-full rounded-lg border border-border bg-background p-3 text-sm"
              placeholder="New tests, schedule changes, tired, busy, etc."
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Energy level</p>
            <div className="flex flex-wrap gap-2">
              {(["low", "medium", "high"] as EnergyLevel[]).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setEnergyLevel(level)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    energyLevel === level
                      ? "bg-accent text-accent-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Starting routine</p>
            <div className="grid gap-2">
              {templateOptions.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setTemplateId(template.id)}
                  className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                    templateId === template.id
                      ? "border-accent bg-accent/10"
                      : "border-border bg-background hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{template.name}</span>
                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{template.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => void handleUsePlanWithoutChanges()}>
              Keep Current Plan
            </Button>
            <Button onClick={() => void handleSaveDailyPlan()}>
              <Flame className="h-4 w-4" />
              Send
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(hideTarget)}
        onClose={() => setHideTarget(null)}
        title="Hide this item?"
        description="This removes it from the mission plan without deleting the underlying source data."
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to hide {hideTarget?.title || "this item"} from the mission?
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setHideTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void handleConfirmHide()}>
              Hide
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
