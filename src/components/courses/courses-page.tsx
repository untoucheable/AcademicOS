"use client";

import Link from "next/link";
import { BookOpen, FileText, GraduationCap, Target, TimerReset, TrendingDown } from "lucide-react";
import { Header } from "@/components/header";
import { useApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LoadingScreen } from "@/components/ui/loading";
import { formatRelativeDue } from "@/lib/date";

export function CoursesPageContent() {
  const { isLoaded, courses, documents } = useApp();

  const strongest = [...courses].sort((a, b) => (b.currentAverage ?? -1) - (a.currentAverage ?? -1))[0];
  const weakest = [...courses].sort((a, b) => (a.currentAverage ?? 101) - (b.currentAverage ?? 101))[0];

  if (!isLoaded) return <LoadingScreen />;

  return (
    <>
      <Header
        title="Courses"
        description="Each class gets its own dashboard with grades, tasks, and notes."
      />

      <main className="space-y-6 p-6">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-muted">
              <BookOpen className="h-5 w-5 text-accent" />
            </div>
            <p className="mt-4 text-2xl font-semibold">{courses.length}</p>
            <p className="text-sm font-medium">Tracked Courses</p>
            <p className="mt-1 text-xs text-muted-foreground">Built from your profile and current work.</p>
          </Card>
          <Card>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
              <GraduationCap className="h-5 w-5 text-emerald-600" />
            </div>
            <p className="mt-4 text-2xl font-semibold">{strongest?.subject || "None"}</p>
            <p className="text-sm font-medium">Strongest Course</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {strongest?.currentAverage !== null && strongest?.currentAverage !== undefined
                ? `${strongest.currentAverage}% average`
                : "Add grades to unlock"}
            </p>
          </Card>
          <Card>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10">
              <TrendingDown className="h-5 w-5 text-red-600" />
            </div>
            <p className="mt-4 text-2xl font-semibold">{weakest?.subject || "None"}</p>
            <p className="text-sm font-medium">Needs Attention</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {weakest?.currentAverage !== null && weakest?.currentAverage !== undefined
                ? `${weakest.currentAverage}% average`
                : "Add grades to unlock"}
            </p>
          </Card>
          <Card>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
              <Target className="h-5 w-5 text-blue-600" />
            </div>
            <p className="mt-4 text-2xl font-semibold">{documents.length}</p>
            <p className="text-sm font-medium">Knowledge Assets</p>
            <p className="mt-1 text-xs text-muted-foreground">Notes and documents by subject.</p>
          </Card>
        </section>

        <section className="grid gap-4">
          {courses.length ? (
            courses.map((course) => (
              <article key={course.subject} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <div className="flex flex-col gap-3 border-b border-border px-5 py-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="font-semibold">{course.subject}</h2>
                    <p className="text-sm text-muted-foreground">
                      {course.currentAverage !== null
                        ? `Current average ${course.currentAverage}%`
                        : "No grades recorded yet"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {course.currentAverage !== null && course.targetAverage !== null ? (
                      <Badge variant={course.currentAverage >= course.targetAverage ? "success" : "warning"}>
                        Target {course.targetAverage}%
                      </Badge>
                    ) : null}
                    <Badge variant="accent">{course.assignmentCount} active tasks</Badge>
                  </div>
                </div>

                <div className="grid gap-4 p-5 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="space-y-4">
                    <div className="rounded-lg border border-border bg-background p-4">
                      <p className="text-xs font-medium uppercase text-muted-foreground">Recommendation</p>
                      <p className="mt-2 text-sm">{course.recommendation}</p>
                      {course.weakTopics.length ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Weak topics: {course.weakTopics.join(", ")}
                        </p>
                      ) : null}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-border bg-background p-4">
                        <p className="text-xs font-medium uppercase text-muted-foreground">Assignments</p>
                        <p className="mt-2 text-2xl font-semibold">{course.assignmentCount}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-background p-4">
                        <p className="text-xs font-medium uppercase text-muted-foreground">Study Time</p>
                        <p className="mt-2 text-2xl font-semibold">
                          {course.studyMinutes < 60 ? `${course.studyMinutes}m` : `${Math.floor(course.studyMinutes / 60)}h`}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-lg border border-border bg-background p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-xs font-medium uppercase text-muted-foreground">Upcoming Work</p>
                        <TimerReset className="h-4 w-4 text-muted-foreground" />
                      </div>
                      {course.upcomingAssignments.length ? (
                        <ul className="space-y-2">
                          {course.upcomingAssignments.map((assignment) => (
                            <li key={assignment.id} className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{assignment.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatRelativeDue(assignment.dueDate)}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground">No active assignments yet.</p>
                      )}
                    </div>

                    <div className="rounded-lg border border-border bg-background p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-xs font-medium uppercase text-muted-foreground">Documents</p>
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {course.notesCount} document{course.notesCount === 1 ? "" : "s"} mention this course.
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-xl border border-border bg-card p-10 text-center shadow-sm">
              <p className="text-sm text-muted-foreground">
                Add subjects, grades, or assignments to populate course dashboards.
              </p>
              <div className="mt-4 flex justify-center">
                <Link
                  href="/grades"
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent/90"
                >
                  Track Grades
                </Link>
              </div>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
