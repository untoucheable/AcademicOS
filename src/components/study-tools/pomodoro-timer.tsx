"use client";

import { useEffect, useMemo, useRef } from "react";
import { CheckCircle2, ClipboardCheck, Pause, Play, RotateCcw } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatFocusTime } from "@/lib/date";
import { cn } from "@/lib/utils";

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getElapsedSecondsSince(startedAt: string | null, now = Date.now()) {
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
}

export function FocusSessionTimer() {
  const { addStudySession, assignments, currentMission, pomodoro, setPomodoro } = useApp();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeAssignments = assignments.filter((assignment) => !assignment.completed);
  const focusTargets = useMemo(() => {
    const plannedTargets = (currentMission?.schedule || [])
      .filter((event) => event.type === "study" && event.relatedAssignmentId)
      .map((event) => ({
        key: event.id,
        assignmentId: event.relatedAssignmentId as string,
        missionEventId: event.id,
        plannedMinutes: Math.max(1, Math.round((new Date(event.endTime).getTime() - new Date(event.startTime).getTime()) / 60000)),
      }));
    const plannedAssignmentIds = new Set(plannedTargets.map((target) => target.assignmentId));

    return [
      ...plannedTargets,
      ...activeAssignments
        .filter((assignment) => !plannedAssignmentIds.has(assignment.id))
        .map((assignment) => ({ key: assignment.id, assignmentId: assignment.id, missionEventId: undefined, plannedMinutes: undefined })),
    ].map((target) => ({
      ...target,
      assignment: activeAssignments.find((assignment) => assignment.id === target.assignmentId),
    })).filter((target) => Boolean(target.assignment));
  }, [activeAssignments, currentMission?.schedule]);

  const selectedTarget = focusTargets.find((target) =>
    target.missionEventId
      ? target.missionEventId === pomodoro.targetMissionEventId
      : target.assignmentId === pomodoro.targetAssignmentId,
  );
  const targetSeconds = (selectedTarget?.plannedMinutes || 0) * 60;
  const progress = targetSeconds ? Math.min(1, pomodoro.timeLeft / targetSeconds) : 0;

  // A saved legacy Pomodoro timer must not become pretend focus time.
  useEffect(() => {
    if (pomodoro.sessionStyle === "focus") return;
    setPomodoro((prev) => ({ ...prev, sessionStyle: "focus", timeLeft: 0, isRunning: false, startedAt: null, mode: "work" }));
  }, [pomodoro.sessionStyle, setPomodoro]);

  useEffect(() => {
    if (!pomodoro.isRunning || pomodoro.sessionStyle !== "focus") {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    // Browser tabs are deliberately throttled in the background. Checkpoint
    // against a real timestamp rather than trusting a one-second interval, so
    // navigation and visibility changes neither lose time nor double-count it.
    const syncElapsedTime = () => {
      const checkpoint = new Date();
      setPomodoro((prev) => {
        if (!prev.isRunning || !prev.startedAt) return prev;
        const elapsed = getElapsedSecondsSince(prev.startedAt, checkpoint.getTime());
        return elapsed > 0
          ? { ...prev, timeLeft: prev.timeLeft + elapsed, startedAt: checkpoint.toISOString() }
          : prev;
      });
    };
    const handleVisibilityChange = () => {
      if (!document.hidden) syncElapsedTime();
    };

    syncElapsedTime();
    intervalRef.current = setInterval(syncElapsedTime, 1000);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pomodoro.isRunning, pomodoro.sessionStyle, setPomodoro]);

  function start() {
    setPomodoro((prev) => ({ ...prev, isRunning: true, startedAt: new Date().toISOString(), mode: "work" }));
  }

  function pause() {
    const pausedAt = new Date();
    setPomodoro((prev) => ({
      ...prev,
      timeLeft: prev.timeLeft + getElapsedSecondsSince(prev.startedAt, pausedAt.getTime()),
      isRunning: false,
      startedAt: null,
    }));
  }

  function discard() {
    setPomodoro((prev) => ({ ...prev, isRunning: false, startedAt: null, timeLeft: 0 }));
  }

  function finish() {
    const finishedAt = new Date();
    const completedSeconds = pomodoro.timeLeft + getElapsedSecondsSince(pomodoro.startedAt, finishedAt.getTime());
    if (completedSeconds <= 0) return;
    if (selectedTarget?.assignment) {
      addStudySession({
        subject: selectedTarget.assignment.subject || selectedTarget.assignment.course || "Study",
        durationMinutes: Math.max(1, Math.round(completedSeconds / 60)),
        productivity: 3,
        relatedAssignmentId: selectedTarget.assignment.id,
        relatedMissionEventId: selectedTarget.missionEventId,
        notes: `Focus session: ${selectedTarget.assignment.title}`,
      });
    }
    setPomodoro((prev) => ({
      ...prev,
      isRunning: false,
      startedAt: null,
      timeLeft: 0,
      sessionsCompleted: prev.sessionsCompleted + 1,
      totalFocusSeconds: prev.totalFocusSeconds + prev.timeLeft + getElapsedSecondsSince(prev.startedAt, finishedAt.getTime()),
    }));
  }

  function setFocusTarget(key: string) {
    const target = focusTargets.find((item) => item.key === key);
    setPomodoro((prev) => ({
      ...prev,
      targetAssignmentId: target?.assignmentId,
      targetMissionEventId: target?.missionEventId,
      targetLabel: target?.assignment?.title,
    }));
  }

  return (
    <Card className="flex flex-col items-center p-8">
      <div className="mb-2">
        <span className={cn("rounded-full bg-red-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-red-600")}>
          {pomodoro.isRunning ? "Focus in progress" : "Focus session"}
        </span>
      </div>

      <div className="relative my-6 flex h-48 w-48 items-center justify-center">
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="4" className="text-muted" />
          <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${progress * 283} 283`} className="text-accent transition-all duration-1000" />
        </svg>
        <div className="text-center">
          <span className="block font-mono text-4xl font-bold tracking-tight">{formatTimer(pomodoro.timeLeft)}</span>
          <span className="text-xs text-muted-foreground">Elapsed</span>
        </div>
      </div>

      <div className="w-full space-y-2">
        <label htmlFor="focus-target" className="flex items-center gap-2 text-sm font-medium">
          <ClipboardCheck className="h-4 w-4 text-accent" />
          Focus target
        </label>
        <select
          id="focus-target"
          value={pomodoro.targetMissionEventId || pomodoro.targetAssignmentId || ""}
          disabled={pomodoro.isRunning}
          onChange={(event) => setFocusTarget(event.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="">General focus session (does not change assignment progress)</option>
          {focusTargets.map((target) => (
            <option key={target.key} value={target.key}>
              {target.missionEventId ? `Mission block (${target.plannedMinutes} min): ` : "Assignment: "}{target.assignment?.title}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          {selectedTarget?.plannedMinutes
            ? `Mission reference: ${selectedTarget.plannedMinutes} minutes. Finish when you are done; AcademicOS will log the actual time.`
            : "Finish when you are done. A selected assignment receives the actual recorded work time."}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap justify-center gap-3">
        {pomodoro.isRunning ? (
          <Button onClick={pause} variant="secondary" size="lg"><Pause className="h-4 w-4" />Pause</Button>
        ) : (
          <Button onClick={start} size="lg"><Play className="h-4 w-4" />Start</Button>
        )}
        <Button onClick={finish} disabled={pomodoro.timeLeft <= 0} size="lg"><CheckCircle2 className="h-4 w-4" />Finish & log</Button>
        <Button onClick={discard} variant="secondary" size="lg"><RotateCcw className="h-4 w-4" />Discard</Button>
      </div>

      <div className="mt-8 grid w-full grid-cols-2 gap-4 border-t border-border pt-6">
        <div className="text-center"><p className="text-2xl font-semibold">{pomodoro.sessionsCompleted}</p><p className="text-xs text-muted-foreground">Focus sessions today</p></div>
        <div className="text-center"><p className="text-2xl font-semibold">{formatFocusTime(pomodoro.totalFocusSeconds)}</p><p className="text-xs text-muted-foreground">Logged focus time</p></div>
      </div>
    </Card>
  );
}
