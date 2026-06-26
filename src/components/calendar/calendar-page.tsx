"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Header } from "@/components/header";
import { useApp } from "@/components/providers/app-provider";
import { Badge, priorityVariant } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingScreen } from "@/components/ui/loading";
import {
  formatDate,
  getAssignmentsForDate,
  getMonthGrid,
  isSameDay,
  toDateKey,
} from "@/lib/date";
import { cn } from "@/lib/utils";
import { CalendarDays } from "lucide-react";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarPageContent() {
  const { isLoaded, assignments } = useApp();
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<Date>(today);

  if (!isLoaded) return <LoadingScreen />;

  const weeks = getMonthGrid(viewDate.getFullYear(), viewDate.getMonth());
  const monthLabel = viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const selectedAssignments = getAssignmentsForDate(assignments, selectedDate);

  function prevMonth() {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  }

  function nextMonth() {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  }

  return (
    <>
      <Header title="Calendar" description="Assignments plotted by due date." />

      <main className="p-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:col-span-2">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="font-semibold">{monthLabel}</h2>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={prevMonth}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
                    setSelectedDate(today);
                  }}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent-muted"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={nextMonth}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted"
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 border-b border-border">
              {DAY_LABELS.map((day) => (
                <div
                  key={day}
                  className="px-2 py-3 text-center text-xs font-medium text-muted-foreground"
                >
                  {day}
                </div>
              ))}
            </div>

            <div>
              {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7">
                  {week.map((date, di) => {
                    if (!date) {
                      return (
                        <div
                          key={`empty-${wi}-${di}`}
                          className="min-h-24 border-b border-r border-border bg-muted/20"
                        />
                      );
                    }

                    const dayAssignments = getAssignmentsForDate(assignments, date);
                    const isTodayCell = isSameDay(date, today);
                    const isSelected = isSameDay(date, selectedDate);

                    return (
                      <button
                        key={toDateKey(date)}
                        type="button"
                        onClick={() => setSelectedDate(date)}
                        className={cn(
                          "min-h-24 border-b border-r border-border p-2 text-left transition-colors hover:bg-muted/40",
                          isTodayCell && "bg-accent-muted/30",
                          isSelected && "ring-2 ring-inset ring-accent",
                        )}
                      >
                        <span
                          className={cn(
                            "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm",
                            isTodayCell && "bg-accent font-semibold text-accent-foreground",
                          )}
                        >
                          {date.getDate()}
                        </span>
                        <div className="mt-1 space-y-1">
                          {dayAssignments.slice(0, 2).map((a) => (
                            <div
                              key={a.id}
                              className={cn(
                                "truncate rounded border-l-2 px-1.5 py-0.5 text-[10px] font-medium",
                                a.completed
                                  ? "border-l-emerald-500 bg-emerald-500/10"
                                  : "border-l-red-500 bg-red-500/10",
                              )}
                            >
                              {a.title}
                            </div>
                          ))}
                          {dayAssignments.length > 2 && (
                            <p className="text-[10px] text-muted-foreground">
                              +{dayAssignments.length - 2} more
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-semibold">{formatDate(toDateKey(selectedDate))}</h2>
              <p className="text-sm text-muted-foreground">
                {selectedAssignments.length} assignment
                {selectedAssignments.length !== 1 ? "s" : ""} due
              </p>
            </div>

            {selectedAssignments.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="No assignments"
                description="Nothing is due on this date."
                className="border-0 bg-transparent py-12"
              />
            ) : (
              <ul className="divide-y divide-border">
                {selectedAssignments.map((a) => (
                  <li key={a.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p
                          className={cn(
                            "font-medium",
                            a.completed && "line-through text-muted-foreground",
                          )}
                        >
                          {a.title}
                        </p>
                        <p className="text-sm text-muted-foreground">{a.course}</p>
                      </div>
                      <Badge variant={priorityVariant(a.priority)}>{a.priority}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {a.completed ? "Completed" : "Pending"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
