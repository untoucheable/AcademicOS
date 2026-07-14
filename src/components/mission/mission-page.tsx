"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RefreshCw, Timer } from "lucide-react";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { LoadingScreen } from "@/components/ui/loading";
import { Mission, sortMissionSchedule } from "@/lib/mission";

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

function isAssessmentTitle(title: string) {
  return /\b(test|quiz|exam)\b/i.test(title);
}

function stripAssessmentWords(title: string) {
  return title.replace(/\b(test|quiz|exam)\b/gi, "").replace(/\s+/g, " ").trim();
}

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
  const [input, setInput] = useState("");
  const [mission, setMission] = useState<Mission | null>(null);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [hideTarget, setHideTarget] = useState<{ id: string; title: string } | null>(null);
  const hasGeneratedInitialMission = useRef(false);
  const orderedSchedule = sortMissionSchedule(mission?.schedule || []);

  function priorityVariant(priority?: number) {
    if ((priority ?? 0) >= 8) return "danger" as const;
    if ((priority ?? 0) >= 5) return "warning" as const;
    return "success" as const;
  }

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
    if (hasGeneratedInitialMission.current) return;
    hasGeneratedInitialMission.current = true;
    void generateMission("");
    void loadReviewItems();
  }, [generateMission, loadReviewItems]);

  async function handleSubmit() {
    await generateMission(input);
    setInput("");
  }

  async function runMockImport(path: string, context: string) {
    setIsLoading(true);
    setError("");

    try {
      const now = new Date();
      const res = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentTime: toLocalISOString(now),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Import failed.");
      }

      await generateMission(context);
      await loadReviewItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleMockClassroomImport() {
    await runMockImport(
      "/api/integrations/mock-classroom",
      "Imported classroom assignments. Rebuild today's mission from confirmed academic data."
    );
  }

  async function handleMockEmailImport() {
    await runMockImport(
      "/api/integrations/mock-email",
      "Imported a teacher email update. Rebuild today's mission from confirmed academic data."
    );
  }

  async function handleMockDocumentImport() {
    await runMockImport(
      "/api/integrations/mock-documents",
      "Imported study notes. Rebuild today's mission from confirmed academic material."
    );
  }

  async function handleMockWebsiteScan() {
    await runMockImport(
      "/api/integrations/mock-website-scan",
      "Scanned a school website. Review uncertain findings before changing today's mission."
    );
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

  async function handleHideFromMission(eventId: string) {
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

      setMission(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mission update failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleConfirmHide() {
    if (!hideTarget) return;
    await handleHideFromMission(hideTarget.id);
    setHideTarget(null);
  }

  const normalizedReview = orderedSchedule.map((event) => {
    if (!mission) return event;
    if (!isAssessmentTitle(event.title)) return event;

    const prepTitle = `Prepare for ${stripAssessmentWords(event.title) || event.title}`;
    return {
      ...event,
      type: "study" as const,
      title: prepTitle,
      priority: Math.max(event.priority, 7),
    };
  });

  if (isLoading && !mission) return <LoadingScreen />;

  return (
    <>
      <Header
        title="Mission"
        description="The AI planner that turns confirmed events into today's path."
        action={
          <Button variant="secondary" onClick={() => void generateMission(input)}>
            <RefreshCw className="h-4 w-4" />
            Rebuild
          </Button>
        }
      />

      <main className="space-y-6 p-6">
        <section className="grid gap-4 md:grid-cols-3">
          <Card>
            <p className="text-xs font-medium uppercase text-muted-foreground">Live replanning</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Refresh the plan as assignments, emails, or calendar events change.
            </p>
          </Card>
          <Card>
            <p className="text-xs font-medium uppercase text-muted-foreground">Focus timer</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Start a study block when the plan is ready.
            </p>
          </Card>
          <Card>
            <p className="text-xs font-medium uppercase text-muted-foreground">Finish session</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Mark completed work and keep the mission aligned with the day.
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
              <h2 className="font-semibold">Today&apos;s Mission Plan</h2>
              <p className="text-sm text-muted-foreground">
                What should happen next, in chronological order.
              </p>
            </div>

            {normalizedReview.length ? (
              <ul className="divide-y divide-border">
                {normalizedReview.map((event) => (
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
                        <div className="mt-2">
                          <Badge variant={priorityVariant(event.priority)}>
                            Priority {event.priority}
                          </Badge>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setHideTarget({ id: event.id, title: event.title })}
                        disabled={isLoading}
                        className="text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
                      >
                        Hide from Mission
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-8 text-sm text-muted-foreground">No schedule generated yet.</p>
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
              <p className="text-sm text-muted-foreground">Review uncertain imported items before applying them.</p>
            </div>
            <ul className="divide-y divide-border">
              {reviewItems.map((item) => (
                <li key={item.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{item.title}</div>
                      <div className="text-sm text-muted-foreground mt-1">{item.reason}</div>
                      <div className="text-xs text-muted-foreground mt-2">
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

      <Modal
        open={Boolean(hideTarget)}
        onClose={() => setHideTarget(null)}
        title="Hide this mission item?"
        description="This removes it from the mission plan without deleting the underlying calendar item."
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to hide {hideTarget?.title || "this item"}?
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setHideTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => void handleConfirmHide()}
            >
              Hide
            </Button>
          </div>
        </div>
      </Modal>

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
              <Button variant="secondary" onClick={handleMockClassroomImport} disabled={isLoading}>
                Import Demo Classroom
              </Button>
              <Button variant="secondary" onClick={handleMockEmailImport} disabled={isLoading}>
                Import Demo Email
              </Button>
              <Button variant="secondary" onClick={handleMockDocumentImport} disabled={isLoading}>
                Import Demo Notes
              </Button>
              <Button variant="secondary" onClick={handleMockWebsiteScan} disabled={isLoading}>
                Scan Demo Website
              </Button>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
