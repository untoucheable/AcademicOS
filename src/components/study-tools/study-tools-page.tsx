"use client";

import Link from "next/link";
import { PenLine } from "lucide-react";
import { Header } from "@/components/header";
import { useApp } from "@/components/providers/app-provider";
import { PomodoroTimer } from "@/components/study-tools/pomodoro-timer";
import { Card } from "@/components/ui/card";
import { LoadingScreen } from "@/components/ui/loading";
import { formatFocusTime } from "@/lib/date";

export function StudyToolsPageContent() {
  const { isLoaded, pomodoro } = useApp();

  if (!isLoaded) return <LoadingScreen />;

  const dailyGoal = 3 * 60 * 60;
  const progress = Math.min(100, Math.round((pomodoro.totalFocusSeconds / dailyGoal) * 100));

  return (
    <>
      <Header title="Study Tools" description="Focus timers and productivity utilities." />

      <main className="p-6">
        <Card className="mb-8 bg-gradient-to-br from-accent-muted to-card">
          <h2 className="text-lg font-semibold">Today&apos;s Focus</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {pomodoro.totalFocusSeconds > 0
              ? `You've focused for ${formatFocusTime(pomodoro.totalFocusSeconds)}.`
              : "Start a Pomodoro session to begin tracking focus time."}
          </p>
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Daily goal: 3 hours</span>
              <span className="font-medium">{progress}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <PomodoroTimer />

          <Card>
            <h3 className="font-semibold">Quick Links</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Jump to other productivity features.
            </p>
            <Link
              href="/documents"
              className="mt-6 flex items-center gap-3 rounded-lg border border-border p-4 transition-colors hover:border-accent/30 hover:bg-muted/50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                <PenLine className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="font-medium">Notes</p>
                <p className="text-sm text-muted-foreground">Create and edit study notes</p>
              </div>
            </Link>
          </Card>
        </div>
      </main>
    </>
  );
}
