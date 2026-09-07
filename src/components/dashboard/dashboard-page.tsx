"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Goal,
  FileText,
  Plus,
  TrendingUp,
  Brain,
} from "lucide-react";
import { Header } from "@/components/header";
import { useApp } from "@/components/providers/app-provider";
import { AssignmentForm } from "@/components/assignments/assignment-form";
import { isAssessmentPrepType } from "@/lib/assignment";
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
import { calculateGradeAverage } from "@/lib/academic-analytics";
import type { CalendarEvent } from "@/lib/calendar";

export function DashboardPageContent() {
  const {
    isLoaded,
    assignments,
    documents,
    profile,
    grades,
    notifications,
    studySessions,
    goals,
    settings,
    pomodoro,
    recentActivity,
    addAssignment,
  } = useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    let active = true;

    void fetch("/api/calendar/events")
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        setCalendarEvents(Array.isArray(data.events) ? data.events : []);
      })
      .catch(() => {
        if (!active) return;
        setCalendarEvents([]);
      });

    return () => {
      active = false;
    };
  }, []);

  const active = assignments.filter((a) => !a.completed);
  const completed = assignments.filter((a) => a.completed);
  const todayAssignments = active.filter((a) => isToday(a.dueDate));
  const upcoming = active
    .filter((a) => isDueSoon(a.dueDate) && !isToday(a.dueDate))
    .slice(0, 5);
  const nextSyncedEvent = useMemo(
    () =>
      [...calendarEvents]
        .filter((event) => new Date(event.startTime).getTime() >= Date.now())
        .sort((a, b) => a.startTime.localeCompare(b.startTime))[0] || null,
    [calendarEvents],
  );

  if (!isLoaded) return <LoadingScreen />;
  const averageGrade = grades.length
    ? Math.round(grades.reduce((total, grade) => total + calculateGradeAverage(grade), 0) / grades.length)
    : 0;

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
      value:
        pomodoro.totalFocusSeconds >= 3600
          ? `${(pomodoro.totalFocusSeconds / 3600).toFixed(1)}h`
          : `${Math.floor(pomodoro.totalFocusSeconds / 60)}m`,
      sub: `${pomodoro.sessionsCompleted} focus sessions`,
      icon: TrendingUp,
    },
    {
      label: "Average Grade",
      value: grades.length ? `${averageGrade}%` : "—",
      sub: grades.length ? `${grades.length} subjects tracked` : "Add grades to unlock",
      icon: Brain,
    },
  ];

  return (
    <>
      <Header
        title="Home"
        description={`${getGreeting()}, ${settings.username}. Here's your academic briefing.`}
        action={
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" />
            Quick Add
          </Button>
        }
      />

      <main className="space-y-6 p-6">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Today&apos;s briefing
          </p>
          <div className="mt-3 grid gap-4 md:grid-cols-4">
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-sm text-muted-foreground">Current focus</p>
              <p className="mt-2 font-medium">
                {active.length > 0 ? active[0].title : "Add an assignment to surface your next focus."}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-sm text-muted-foreground">Next task</p>
              <p className="mt-2 font-medium">{todayAssignments[0]?.title || "Nothing due today"}</p>
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-sm text-muted-foreground">AI recommendation</p>
              <p className="mt-2 font-medium">
                {upcoming[0]?.title
                  ? `Get ahead on ${upcoming[0].title}.`
                  : "Use Ask AcademicOS to plan your study session."}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-sm text-muted-foreground">Next synced event</p>
              <p className="mt-2 font-medium">
                {nextSyncedEvent ? nextSyncedEvent.title : "No synced calendar events yet."}
              </p>
              {nextSyncedEvent ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(nextSyncedEvent.startTime).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <article className="overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:col-span-2">
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-semibold">Important updates</h2>
              <p className="text-sm text-muted-foreground">Shared changes flowing through the system.</p>
            </div>
            {notifications.length ? (
              <ul className="divide-y divide-border">
                {notifications.slice(0, 3).map((notification) => (
                  <li key={notification.id} className="px-5 py-4">
                    <p className="text-sm font-medium">{notification.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{notification.body}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-8 text-sm text-muted-foreground">
                No major updates yet. New assignments, grades, and notes will appear here.
              </p>
            )}
          </article>

          <article className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-semibold">Connected systems</h2>
              <p className="text-sm text-muted-foreground">Views pulling from shared records.</p>
            </div>
            <ul className="divide-y divide-border">
              {[
                "Mission",
                "Calendar",
                "Assignments",
                "Courses",
                "Documents",
                "AI Tutor",
                "Analytics",
              ].map((item) => (
                <li key={item} className="px-5 py-3 text-sm text-muted-foreground">
                  {item}
                </li>
              ))}
            </ul>
          </article>
        </section>

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

        <section className="grid gap-6 lg:grid-cols-3">
          <article className="overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:col-span-2">
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-semibold">Personal Command Center</h2>
              <p className="text-sm text-muted-foreground">
                Profile, goals, and the current academic picture.
              </p>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">Profile</p>
                <p className="mt-2 font-medium">{profile.name || settings.username}</p>
                <p className="text-sm text-muted-foreground">{profile.school || "School not set"}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Mode: {settings.mode} | Study style: {profile.preferredStudyStyle}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">Long-Term Goals</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {goals.length
                    ? `${goals.length} active roadmap goal${goals.length !== 1 ? "s" : ""}`
                    : "Add a goal in Analytics to build a roadmap."}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Subjects tracked: {profile.subjects.length || 0}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">Study Sessions</p>
                <p className="mt-2 text-2xl font-semibold">{studySessions.length}</p>
                <p className="text-sm text-muted-foreground">Logged sessions</p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">Next Step</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {active.length > 0
                    ? `Work on ${active[0].title}`
                    : "Add an assignment or grade to get a clearer plan."}
                </p>
              </div>
            </div>
          </article>

          <article className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-semibold">Roadmap</h2>
              <p className="text-sm text-muted-foreground">Long-term progress and next focus.</p>
            </div>
            {goals.length ? (
              <ul className="divide-y divide-border">
                {goals.slice(0, 3).map((goal) => (
                  <li key={goal.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{goal.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {goal.targetDate ? `Target ${goal.targetDate}` : "No target date"}
                        </p>
                      </div>
                      <Goal className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${goal.progress}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-8 text-sm text-muted-foreground">
                No roadmap goals yet. Analytics can add one.
              </p>
            )}
          </article>
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
              <Link href="/ai-tutor">
                <Button className="bg-white text-accent hover:bg-indigo-50">AI Tutor</Button>
              </Link>
              <Link href="/mission">
                <Button
                  variant="secondary"
                  className="border-white/30 bg-transparent text-white hover:bg-white/10"
                >
                  Mission
                </Button>
              </Link>
              <Link href="/documents">
                <Button
                  variant="secondary"
                  className="border-white/30 bg-transparent text-white hover:bg-white/10"
                >
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
        description="Add an assignment without leaving the home screen."
      >
        <AssignmentForm
          onCancel={() => setModalOpen(false)}
          onSubmit={(data) => {
            const progress = isAssessmentPrepType(data.assessmentType)
              ? {
                  percentComplete: 0,
                  completedSteps: [],
                  remainingSteps: [],
                  studyMinutesCompleted: data.studyMinutesCompleted,
                  lastUpdatedAt: new Date().toISOString(),
                }
              : {
                  percentComplete: data.progressPercent,
                  completedSteps: [],
                  remainingSteps: [],
                  lastUpdatedAt: new Date().toISOString(),
                };

            addAssignment({
              title: data.title.trim(),
              course: data.course.trim(),
              assessmentType: data.assessmentType,
              dueDate: data.dueDate,
              dueTime: data.dueTime || undefined,
              priority: data.priority,
              notes: data.notes.trim(),
              estimatedMinutes: data.estimatedMinutes,
              progress,
            });
            setModalOpen(false);
          }}
        />
      </Modal>
    </>
  );
}
