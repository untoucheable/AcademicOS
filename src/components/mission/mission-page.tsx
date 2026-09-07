"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CalendarDays, Flame, Plus, RefreshCw, Timer } from "lucide-react";
import { Header } from "@/components/header";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingScreen } from "@/components/ui/loading";
import { Modal } from "@/components/ui/modal";
import type { CalendarEventType } from "@/lib/calendar";
import { Mission, sortMissionSchedule } from "@/lib/mission";
import {
  buildDailyPlanEvents,
  getDefaultDailyPlanTemplateId,
} from "@/lib/daily-plans";
import type {
  DailyMissionPlan,
  DailyPlanSchoolMode,
  EnergyLevel,
  MissionManualBlock,
} from "@/lib/types";

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

type ManualBlockFormState = {
  title: string;
  start: string;
  end: string;
  type: CalendarEventType;
  relatedAssignmentId: string;
  addToCalendar: boolean;
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

function toNumericEnergy(level: EnergyLevel) {
  if (level === "low") return 3;
  if (level === "high") return 8;
  return 6;
}

export function MissionPageContent() {
  const {
    isLoaded,
    assignments,
    dailyMissionPlan,
    currentMission,
    refreshState,
    setDailyMissionPlan,
    status,
    updateStatus,
  } = useApp();
  const [input, setInput] = useState("");
  const [mission, setMission] = useState<Mission | null>(null);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [removeTarget, setRemoveTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [planPromptOpen, setPlanPromptOpen] = useState(false);
  const [majorUpdates, setMajorUpdates] = useState("");
  const [energyLevel, setEnergyLevel] = useState<EnergyLevel>("medium");
  const [focusScore, setFocusScore] = useState(6);
  const [schoolMode, setSchoolMode] = useState<DailyPlanSchoolMode>("auto");
  const [stressLevel, setStressLevel] = useState(5);
  const [manualBlockOpen, setManualBlockOpen] = useState(false);
  const [manualBlockError, setManualBlockError] = useState("");
  const [manualBlockForm, setManualBlockForm] = useState<ManualBlockFormState>({
    title: "",
    start: "15:30",
    end: "16:30",
    type: "study",
    relatedAssignmentId: "",
    addToCalendar: false,
  });
  const hasLoadedInitialMission = useRef(false);
  const todayKey = useMemo(() => toLocalISOString(new Date()).slice(0, 10), []);
  const missionDayKey = mission?.currentTime?.slice(0, 10) || "";
  const currentMissionDayKey = currentMission?.currentTime?.slice(0, 10) || "";
  const orderedSchedule = sortMissionSchedule(mission?.schedule || []);
  const basePlanEvents = useMemo(
    () => buildDailyPlanEvents(dailyMissionPlan, toLocalISOString(new Date())),
    [dailyMissionPlan],
  );
  const displaySchedule = missionDayKey === todayKey && orderedSchedule.length ? orderedSchedule : basePlanEvents;

  useEffect(() => {
    if (currentMissionDayKey === todayKey && currentMission) {
      setMission(currentMission);
      return;
    }
    setMission(null);
  }, [currentMission, currentMissionDayKey, todayKey]);

  const loadReviewItems = useCallback(async () => {
    const res = await fetch("/api/review");
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      setReviewItems(data.items || []);
    }
  }, []);

  const generateMission = useCallback(async (context: string, mode: "daily-plan" | "quick-update" | "replan" | "review" = "replan") => {
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
          mode,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Mission generation failed.");
      }

      setMission(data);
      await refreshState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mission generation failed.");
    } finally {
      setIsLoading(false);
    }
  }, [refreshState]);

  useEffect(() => {
    if (!isLoaded) return;
    void loadReviewItems();
  }, [isLoaded, loadReviewItems]);

  useEffect(() => {
    if (!isLoaded) return;
    if (hasLoadedInitialMission.current) return;

    setMajorUpdates(dailyMissionPlan?.majorUpdates || "");
    setEnergyLevel(dailyMissionPlan?.energyLevel || "medium");
    setFocusScore(dailyMissionPlan?.focusScore ?? status.focusScore ?? 6);
    setSchoolMode(dailyMissionPlan?.schoolMode || "auto");
    setStressLevel(dailyMissionPlan?.stressLevel ?? status.stressLevel ?? 5);
    hasLoadedInitialMission.current = true;

    // Returning to Mission must show the saved plan as-is. Only ask for a
    // day update when this is genuinely a new day with no plan yet.
    setPlanPromptOpen(!dailyMissionPlan || dailyMissionPlan.date !== todayKey);
  }, [dailyMissionPlan, isLoaded, status.focusScore, status.stressLevel, todayKey]);

  async function handleSubmit() {
    await generateMission(input, "quick-update");
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
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Review action failed.");
      }

      setReviewItems(data.items || []);

      if (action === "approve") {
        await generateMission("Approved a detected academic item. Rebuild today's mission from confirmed academic data.", "review");
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
        body: JSON.stringify({ action: "delete-mission-item", eventId }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Mission update failed.");
      }

      setMission(data.currentMission || data);
      await refreshState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mission update failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleConfirmHide() {
    if (!removeTarget) return;
    await handleRemoveEvent(removeTarget.id);
    setRemoveTarget(null);
  }

  async function handleSaveDailyPlan() {
    const nextPlan: DailyMissionPlan = {
      date: todayKey,
      templateId: dailyMissionPlan?.templateId || getDefaultDailyPlanTemplateId(energyLevel),
      energyLevel,
      focusScore,
      majorUpdates: majorUpdates.trim(),
      schoolMode,
      stressLevel,
      sleepTarget: dailyMissionPlan?.sleepTarget || "22:30",
      manualBlocks: dailyMissionPlan?.manualBlocks || [],
      updatedAt: new Date().toISOString(),
    };

    await setDailyMissionPlan(nextPlan);
    await updateStatus({
      energyLevel: toNumericEnergy(energyLevel),
      focusScore,
      stressLevel,
    });
    setPlanPromptOpen(false);
    hasLoadedInitialMission.current = true;
    await generateMission(nextPlan.majorUpdates, "daily-plan");
  }

  async function handleUsePlanWithoutChanges() {
    if (currentMissionDayKey === todayKey && currentMission) {
      setPlanPromptOpen(false);
      return;
    }

    const nextPlan: DailyMissionPlan = {
      date: todayKey,
      templateId: dailyMissionPlan?.templateId || getDefaultDailyPlanTemplateId(energyLevel),
      energyLevel: dailyMissionPlan?.energyLevel || energyLevel,
      focusScore: dailyMissionPlan?.focusScore ?? focusScore,
      majorUpdates: dailyMissionPlan?.majorUpdates || majorUpdates.trim(),
      schoolMode: dailyMissionPlan?.schoolMode || schoolMode,
      stressLevel: dailyMissionPlan?.stressLevel ?? stressLevel,
      sleepTarget: dailyMissionPlan?.sleepTarget || "22:30",
      manualBlocks: dailyMissionPlan?.manualBlocks || [],
      updatedAt: new Date().toISOString(),
    };

    await setDailyMissionPlan(nextPlan);
    await updateStatus({
      energyLevel: toNumericEnergy(nextPlan.energyLevel),
      focusScore: nextPlan.focusScore,
      stressLevel: nextPlan.stressLevel,
    });
    setPlanPromptOpen(false);
    await generateMission(nextPlan.majorUpdates, "daily-plan");
  }

  async function handleManualHealthSave() {
    setIsLoading(true);
    setError("");

    try {
      await updateStatus({
        energyLevel: toNumericEnergy(energyLevel),
        focusScore,
        stressLevel,
      });

      if (dailyMissionPlan) {
        await setDailyMissionPlan({
          ...dailyMissionPlan,
          energyLevel,
          focusScore,
          stressLevel,
          updatedAt: new Date().toISOString(),
        });
      }

      await generateMission("Mission health changed.", "replan");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mission health could not be updated.");
      setIsLoading(false);
    }
  }

  async function handleAddManualBlock() {
    setManualBlockError("");
    const title = manualBlockForm.title.trim();

    if (!title) {
      setManualBlockError("Block name is required.");
      return;
    }

    const startTime = toLocalISOString(new Date(`${todayKey}T${manualBlockForm.start}:00`));
    const endTime = toLocalISOString(new Date(`${todayKey}T${manualBlockForm.end}:00`));

    if (new Date(endTime).getTime() <= new Date(startTime).getTime()) {
      setManualBlockError("End time must be after start time.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      let calendarEventId: string | undefined;

      if (manualBlockForm.addToCalendar) {
        const calendarResponse = await fetch("/api/calendar/events", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title,
            type: manualBlockForm.type,
            startTime,
            endTime,
            relatedAssignmentId: manualBlockForm.relatedAssignmentId || undefined,
          }),
        });
        const calendarData = await calendarResponse.json().catch(() => ({}));

        if (!calendarResponse.ok) {
          throw new Error(calendarData.error || "Fixed event could not be created.");
        }

        calendarEventId = calendarData.event?.id;
      }

      const nextBlock: MissionManualBlock = {
        id: `manual-block:${crypto.randomUUID()}`,
        title,
        type: manualBlockForm.type,
        startTime,
        endTime,
        relatedAssignmentId: manualBlockForm.relatedAssignmentId || undefined,
        calendarEventId,
      };

      const nextPlan: DailyMissionPlan = {
        date: todayKey,
        templateId: dailyMissionPlan?.templateId || getDefaultDailyPlanTemplateId(energyLevel),
        energyLevel: dailyMissionPlan?.energyLevel || energyLevel,
        focusScore: dailyMissionPlan?.focusScore ?? focusScore,
        majorUpdates: dailyMissionPlan?.majorUpdates || majorUpdates.trim(),
        schoolMode: dailyMissionPlan?.schoolMode || schoolMode,
        stressLevel: dailyMissionPlan?.stressLevel ?? stressLevel,
        sleepTarget: dailyMissionPlan?.sleepTarget || "22:30",
        manualBlocks: [...(dailyMissionPlan?.manualBlocks || []), nextBlock],
        updatedAt: new Date().toISOString(),
      };

      await setDailyMissionPlan(nextPlan);
      setManualBlockOpen(false);
      setManualBlockForm({
        title: "",
        start: "15:30",
        end: "16:30",
        type: "study",
        relatedAssignmentId: "",
        addToCalendar: false,
      });
      await generateMission(`Added manual block: ${title}.`, "daily-plan");
    } catch (err) {
      setManualBlockError(err instanceof Error ? err.message : "Block could not be added.");
      setIsLoading(false);
    }
  }

  if (!isLoaded || (isLoading && !mission && !planPromptOpen)) return <LoadingScreen />;

  return (
    <>
      <Header
        title="Mission"
        description="The AI planner that turns confirmed events into today's path."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setManualBlockOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Block
            </Button>
            <Button variant="secondary" onClick={() => setPlanPromptOpen(true)}>
              <CalendarDays className="h-4 w-4" />
              Edit Day Plan
            </Button>
          </div>
        }
      />

      <main className="space-y-6 p-6">
        <section className="grid gap-4 md:grid-cols-3">
          <Card>
            <p className="text-xs font-medium uppercase text-muted-foreground">Today&apos;s Plan</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {schoolMode === "skip"
                ? "No school baseline today. Mission will use your updates and fixed events."
                : "Mission uses your weekday baseline, fixed events, and today's updates."}
            </p>
          </Card>
          <Card>
            <p className="text-xs font-medium uppercase text-muted-foreground">School</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {schoolMode === "skip"
                ? "School is removed from today."
                : "Weekdays use the regular school day unless you turn it off."}
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
                One saved plan, shaped by fixed commitments, manual edits, and today&apos;s work.
              </p>
            </div>

            {displaySchedule.length ? (
              <ul className="divide-y divide-border">
                {displaySchedule.map((event) => {
                  const isBasePlanEvent = event.id.startsWith("daily-plan:");
                  const isSavedManualBlock = event.id.startsWith("manual-block:");
                  const isAddedWork = (event.source === "ai" || isSavedManualBlock) && !isBasePlanEvent;
                  const tag = isBasePlanEvent
                    ? "Base block"
                    : isSavedManualBlock
                      ? "Saved block"
                    : isAddedWork
                      ? "Added work"
                      : event.source === "manual"
                        ? "Fixed event"
                        : "Plan item";

                  return (
                    <li key={`${event.id}-${event.startTime}-${event.endTime}`} className="px-5 py-4">
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
                            onClick={() => setRemoveTarget({
                              id: event.id,
                              title: event.title,
                            })}
                            disabled={isLoading}
                            className="text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
                          >
                            Remove from Mission
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
                <p className="text-sm text-muted-foreground">Mission health that you can actually control.</p>
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
              <div className="border-t border-border px-5 py-4">
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Energy level</span>
                      <span className="capitalize text-muted-foreground">{energyLevel}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {(["low", "medium", "high"] as EnergyLevel[]).map((level) => (
                        <button
                          key={`health-energy-${level}`}
                          type="button"
                          onClick={() => setEnergyLevel(level)}
                          className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                            energyLevel === level
                              ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : "border-border bg-background text-foreground hover:bg-muted"
                          }`}
                        >
                          {level[0].toUpperCase() + level.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span>Focus score</span>
                      <span className="text-muted-foreground">{focusScore}/10</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={focusScore}
                      onChange={(e) => setFocusScore(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span>Stress level</span>
                      <span className="text-muted-foreground">{stressLevel}/10</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={stressLevel}
                      onChange={(e) => setStressLevel(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <Button variant="secondary" onClick={() => void handleManualHealthSave()} disabled={isLoading}>
                    Apply Mission Health
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Burnout risk is calculated from your energy, focus, stress, and current workload pressure.
                  </p>
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
                <Button variant="secondary" onClick={() => void generateMission(input, "replan")}>
                  <RefreshCw className="h-4 w-4" />
                  Replan
                </Button>
                <Button variant="secondary" onClick={() => setManualBlockOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Add Manual Block
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
              placeholder="e.g. I&apos;m tired / test moved / soccer today"
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
        description="Tell AcademicOS what changed today, and it will rebuild the plan around your real fixed events."
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
            <p className="text-sm font-medium text-foreground">School today</p>
            <div className="flex flex-wrap gap-2">
              {([
                { id: "auto", label: "Regular school day" },
                { id: "skip", label: "No school today" },
              ] as const).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSchoolMode(option.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    schoolMode === option.id
                      ? "bg-accent text-accent-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Weekdays use morning run, school, and the ride home automatically unless you turn school off for today.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <p className="font-medium text-foreground">Focus score</p>
                <span className="text-muted-foreground">{focusScore}/10</span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                value={focusScore}
                onChange={(e) => setFocusScore(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <p className="font-medium text-foreground">Stress level</p>
                <span className="text-muted-foreground">{stressLevel}/10</span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                value={stressLevel}
                onChange={(e) => setStressLevel(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Burnout risk will be calculated from the energy, focus, stress, and workload you give AcademicOS.
          </p>

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
        open={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        title="Remove this item?"
        description="This removes the block from today's mission and rebalances the rest of the day."
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to remove {removeTarget?.title || "this item"} from the mission?
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void handleConfirmHide()}>
              Remove
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={manualBlockOpen}
        onClose={() => setManualBlockOpen(false)}
        title="Add a manual block"
        description="Use this when you want to place a block yourself and make the planner respect it."
      >
        <div className="space-y-4">
          {manualBlockError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {manualBlockError}
            </div>
          ) : null}

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="manual-block-title">
              Block name
            </label>
            <input
              id="manual-block-title"
              value={manualBlockForm.title}
              onChange={(e) => setManualBlockForm((current) => ({ ...current, title: e.target.value }))}
              className="w-full rounded-lg border border-border bg-background p-2"
              placeholder="Math homework"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="manual-block-start">
                Start
              </label>
              <input
                id="manual-block-start"
                type="time"
                value={manualBlockForm.start}
                onChange={(e) => setManualBlockForm((current) => ({ ...current, start: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background p-2"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="manual-block-end">
                End
              </label>
              <input
                id="manual-block-end"
                type="time"
                value={manualBlockForm.end}
                onChange={(e) => setManualBlockForm((current) => ({ ...current, end: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background p-2"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="manual-block-type">
                Block type
              </label>
              <select
                id="manual-block-type"
                value={manualBlockForm.type}
                onChange={(e) => setManualBlockForm((current) => ({
                  ...current,
                  type: e.target.value as "study" | "break" | "personal" | "school" | "exercise",
                }))}
                className="w-full rounded-lg border border-border bg-background p-2 text-sm"
              >
                <option value="study">Study / work</option>
                <option value="personal">Personal</option>
                <option value="exercise">Exercise</option>
                <option value="school">School</option>
                <option value="break">Break</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="manual-block-assignment">
                Related assignment
              </label>
              <select
                id="manual-block-assignment"
                value={manualBlockForm.relatedAssignmentId}
                onChange={(e) => setManualBlockForm((current) => ({ ...current, relatedAssignmentId: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background p-2 text-sm"
              >
                <option value="">None</option>
                {assignments
                  .filter((assignment) => !assignment.completed)
                  .map((assignment) => (
                    <option key={assignment.id} value={assignment.id}>
                      {assignment.title}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={manualBlockForm.addToCalendar}
              onChange={(e) => setManualBlockForm((current) => ({ ...current, addToCalendar: e.target.checked }))}
            />
            Also save this as a fixed calendar event
          </label>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setManualBlockOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleAddManualBlock()} disabled={isLoading}>
              Save Block
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
