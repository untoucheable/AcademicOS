"use client";

import { useEffect, useRef } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
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

export function PomodoroTimer() {
  const { pomodoro, setPomodoro } = useApp();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Restore elapsed time if timer was running when page was closed
  useEffect(() => {
    if (!pomodoro.isRunning || !pomodoro.startedAt) return;

    const elapsed = Math.floor((Date.now() - new Date(pomodoro.startedAt).getTime()) / 1000);
    if (elapsed <= 0) return;

    setPomodoro((prev) => {
      const timeLeft = prev.timeLeft - elapsed;
      if (timeLeft > 0) return { ...prev, timeLeft };

      // Session completed while away
      const isWork = prev.mode === "work";
      return {
        ...prev,
        isRunning: false,
        startedAt: null,
        mode: isWork ? "break" : "work",
        timeLeft: isWork ? prev.breakDuration : prev.workDuration,
        sessionsCompleted: isWork ? prev.sessionsCompleted + 1 : prev.sessionsCompleted,
        totalFocusSeconds: isWork
          ? prev.totalFocusSeconds + prev.workDuration
          : prev.totalFocusSeconds,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pomodoro.isRunning) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      setPomodoro((prev) => {
        if (prev.timeLeft <= 1) {
          const isWork = prev.mode === "work";
          return {
            ...prev,
            isRunning: false,
            startedAt: null,
            mode: isWork ? "break" : "work",
            timeLeft: isWork ? prev.breakDuration : prev.workDuration,
            sessionsCompleted: isWork ? prev.sessionsCompleted + 1 : prev.sessionsCompleted,
            totalFocusSeconds: isWork
              ? prev.totalFocusSeconds + prev.workDuration
              : prev.totalFocusSeconds,
          };
        }
        return { ...prev, timeLeft: prev.timeLeft - 1 };
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pomodoro.isRunning, setPomodoro]);

  function start() {
    setPomodoro((prev) => ({
      ...prev,
      isRunning: true,
      startedAt: new Date().toISOString(),
    }));
  }

  function pause() {
    setPomodoro((prev) => ({
      ...prev,
      isRunning: false,
      startedAt: null,
    }));
  }

  function reset() {
    setPomodoro((prev) => ({
      ...prev,
      isRunning: false,
      startedAt: null,
      timeLeft: prev.mode === "work" ? prev.workDuration : prev.breakDuration,
    }));
  }

  const progress =
    pomodoro.mode === "work"
      ? 1 - pomodoro.timeLeft / pomodoro.workDuration
      : 1 - pomodoro.timeLeft / pomodoro.breakDuration;

  return (
    <Card className="flex flex-col items-center p-8">
      <div className="mb-2">
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide",
            pomodoro.mode === "work"
              ? "bg-red-500/10 text-red-600"
              : "bg-emerald-500/10 text-emerald-600",
          )}
        >
          {pomodoro.mode === "work" ? "Focus" : "Break"}
        </span>
      </div>

      <div className="relative my-6 flex h-48 w-48 items-center justify-center">
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="4" className="text-muted" />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${progress * 283} 283`}
            className="text-accent transition-all duration-1000"
          />
        </svg>
        <span className="font-mono text-4xl font-bold tracking-tight">
          {formatTimer(pomodoro.timeLeft)}
        </span>
      </div>

      <div className="flex gap-3">
        {pomodoro.isRunning ? (
          <Button onClick={pause} variant="secondary" size="lg">
            <Pause className="h-4 w-4" />
            Pause
          </Button>
        ) : (
          <Button onClick={start} size="lg">
            <Play className="h-4 w-4" />
            Start
          </Button>
        )}
        <Button onClick={reset} variant="secondary" size="lg">
          <RotateCcw className="h-4 w-4" />
          Reset
        </Button>
      </div>

      <div className="mt-8 grid w-full grid-cols-2 gap-4 border-t border-border pt-6">
        <div className="text-center">
          <p className="text-2xl font-semibold">{pomodoro.sessionsCompleted}</p>
          <p className="text-xs text-muted-foreground">Sessions today</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-semibold">{formatFocusTime(pomodoro.totalFocusSeconds)}</p>
          <p className="text-xs text-muted-foreground">Total focus time</p>
        </div>
      </div>
    </Card>
  );
}
