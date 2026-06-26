"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  Clock,
  FileText,
  Plus,
  TrendingUp,
} from "lucide-react";
import { Header } from "@/components/header";
import { useApp } from "@/components/providers/app-provider";
import { AssignmentForm } from "@/components/assignments/assignment-form";
import { AssignmentListCompact } from "@/components/assignments/assignments-page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingScreen } from "@/components/ui/loading";
import { Modal } from "@/components/ui/modal";
import {
  formatRelativeDue,
  formatTimeAgo,
  getGreeting,
  isDueSoon,
  isToday,
  toDateKey,
} from "@/lib/date";

export function DashboardPageContent() {
  const {
    isLoaded,
    assignments,
    documents,
    settings,
    pomodoro,
    recentActivity,
    addAssignment,
  } = useApp();
  const [modalOpen, setModalOpen] = useState(false);

  if (!isLoaded) return <LoadingScreen />;

  const active = assignments.filter((a) => !a.completed);
  const completed = assignments.filter((a) => a.completed);
  const todayAssignments = active.filter((a) => isToday(a.dueDate));
  const upcoming = active
    .filter((a) => isDueSoon(a.dueDate) && !isToday(a.dueDate))
    .slice(0, 5);

  const stats = [
    {
      label: "Active Assignments",
      value: String(active.length),
      sub: `${todayAssignments.length} due today`,
      icon: BookOpen,
    },
    {
      label: "Completed",
      value: String(completed.length),
      sub: assignments.length
        ? `${Math.round((completed.length / assignments.length) * 100)}% done`
        : "No assignments yet",
      icon: CheckCircle2,
    },
    {
      label: "Notes",
      value: String(documents.length),
      sub: documents.length ? "Saved locally" : "Create your first note",
      icon: FileText,
    },
    {
      label: "Focus Time",
      value: pomodoro.totalFocusSeconds >= 3600
        ? `${(pomodoro.totalFocusSeconds / 3600).toFixed(1)}h`
        : `${Math.floor(pomodoro.totalFocusSeconds / 60)}m`,
      sub: `${pomodoro.sessionsCompleted} pomodoro sessions`,
      icon: TrendingUp,
    },
  ];

  return (
    <>
      <Header
        title="Dashboard"
        description={`${getGreeting()}, ${settings.username}. Here's your academic overview.`}
        action={
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" />
            Quick Add
          </Button>
        }
      />

      <main className="space-y-6 p-6">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label}>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-muted">
                  <Icon className="h-5 w-5 text-accent" />
                </div>
                <p className="mt-4 text-2xl font-semibold tracking-tight">{stat.value}</p>
                <p className="text-sm font-medium">{stat.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{stat.sub}</p>
              </Card>
            );
          })}
        </section>

        <section className="grid gap-6 lg:grid-cols-5">
          <article className="overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:col-span-3">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="font-semibold">Due Today</h2>
                <p className="text-sm text-muted-foreground">
                  {todayAssignments.length} assignment{todayAssignments.length !== 1 ? "s" : ""}{" "}
                  for {toDateKey(new Date())}
                </p>
              </div>
              <Link href="/assignments" className="text-sm font-medium text-accent hover:underline">
                View all
              </Link>
            </div>
            <AssignmentListCompact
              items={todayAssignments}
              emptyMessage="Nothing due today — great time to get ahead!"
            />
          </article>

          <article className="overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:col-span-2">
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-semibold">Recent Activity</h2>
              <p className="text-sm text-muted-foreground">Your latest updates</p>
            </div>
            {recentActivity.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                Activity will appear as you add assignments and notes.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {recentActivity.map((item) => (
                  <li key={item.id} className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div>
                        <p className="text-sm">
                          <span className="font-medium">{item.action}</span>{" "}
                          <span className="text-muted-foreground">{item.item}</span>
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatTimeAgo(item.timestamp)}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </section>

        {upcoming.length > 0 && (
          <article className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-semibold">Upcoming Deadlines</h2>
              <p className="text-sm text-muted-foreground">Due within the next 7 days</p>
            </div>
            <ul className="divide-y divide-border">
              {upcoming.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/20"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{item.course}</p>
                  </div>
                  <span className="shrink-0 text-sm text-muted-foreground">
                    {formatRelativeDue(item.dueDate)}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        )}

        <section className="rounded-xl border border-border bg-gradient-to-r from-accent to-indigo-700 p-6 text-white shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Ready to focus?</h2>
              <p className="mt-1 text-sm text-indigo-100">
                {active.length > 0
                  ? `You have ${active.length} active assignment${active.length !== 1 ? "s" : ""} to work on.`
                  : "All caught up! Start a study session or create a new note."}
              </p>
            </div>
            <div className="flex shrink-0 gap-3">
              <Link href="/study-tools">
                <Button className="bg-white text-accent hover:bg-indigo-50">Study Tools</Button>
              </Link>
              <Link href="/documents">
                <Button variant="secondary" className="border-white/30 bg-transparent text-white hover:bg-white/10">
                  Notes
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Quick Add Assignment"
        description="Add an assignment without leaving the dashboard."
      >
        <AssignmentForm
          onCancel={() => setModalOpen(false)}
          onSubmit={(data) => {
            addAssignment(data);
            setModalOpen(false);
          }}
        />
      </Modal>
    </>
  );
}
