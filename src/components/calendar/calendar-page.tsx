"use client";

import { useEffect, useMemo, useState } from "react";
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
import type { CalendarEvent } from "@/lib/calendar";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function isImportantCalendarEvent(event: CalendarEvent) {
  if (event.source === "ai") return false;
  if (event.type === "break") return false;
  return true;
}

function isUpcomingCalendarEvent(event: CalendarEvent, now: Date) {
  return new Date(event.endTime).getTime() >= now.getTime();
}

export function CalendarPageContent() {
  const { isLoaded, assignments } = useApp();
  const [today] = useState(() => new Date());
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [currentTime] = useState(() => new Date());
  const todayKey = toDateKey(today);

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

  const weeks = getMonthGrid(viewDate.getFullYear(), viewDate.getMonth());
  const monthLabel = viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const selectedAssignments = getAssignmentsForDate(assignments, selectedDate).filter(
    (assignment) => assignment.dueDate >= todayKey,
  );
  const importantCalendarEvents = useMemo(
    () =>
      calendarEvents
        .filter(isImportantCalendarEvent)
        .filter((event) => isUpcomingCalendarEvent(event, currentTime)),
    [calendarEvents, currentTime],
  );
  const selectedCalendarEvents = useMemo(
    () =>
      importantCalendarEvents
        .filter((event) => isSameDay(new Date(event.startTime), selectedDate))
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [importantCalendarEvents, selectedDate],
  );
  const upcomingItems = useMemo(() => {
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + 14);
    end.setHours(23, 59, 59, 999);

    const assignmentItems = assignments
      .filter((assignment) => {
        return assignment.dueDate >= todayKey && assignment.dueDate <= toDateKey(end);
      })
      .map((assignment) => ({
        id: `assignment-${assignment.id}`,
        title: assignment.title,
        course: assignment.course,
        when: new Date(assignment.dueDate).toISOString(),
        timeLabel: "Due",
        badge: assignment.completed ? "Completed" : "Assignment",
        badgeVariant: assignment.completed ? ("success" as const) : ("default" as const),
      }));

    const calendarItems = importantCalendarEvents
      .filter((event) => {
        const startTime = new Date(event.startTime);
        return startTime >= start && startTime <= end;
      })
      .map((event) => ({
        id: event.id,
        title: event.title,
        course: event.source === "google-calendar" ? "Imported from Google Calendar" : "AcademicOS block",
        when: event.startTime,
        timeLabel: new Date(event.startTime).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        }),
        badge: event.source === "google-calendar" ? "Imported" : event.fixed ? "Fixed" : "Study block",
        badgeVariant:
          event.source === "google-calendar"
            ? ("accent" as const)
            : event.fixed
              ? ("success" as const)
              : ("default" as const),
      }));

    return [...assignmentItems, ...calendarItems].sort(
      (a, b) => new Date(a.when).getTime() - new Date(b.when).getTime(),
    );
  }, [assignments, importantCalendarEvents, today, todayKey]);

  if (!isLoaded) return <LoadingScreen />;

  function prevMonth() {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  }

  function nextMonth() {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  }

  return (
    <>
      <Header
        title="Calendar"
        description="What is coming up across assignments and important fixed events."
      />

      <main className="p-6">
        <section className="mb-6 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 className="font-semibold">Upcoming next 14 days</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Important calendar events and assignment deadlines in chronological order.
              </p>
            </div>
            <Badge variant="accent">{upcomingItems.length} items</Badge>
          </div>
          {upcomingItems.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="Nothing lined up yet"
              description="Important events and upcoming assignments will appear here as they come in."
              className="border-0 bg-transparent py-10"
            />
          ) : (
            <div className="divide-y divide-border">
              {upcomingItems.slice(0, 8).map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{item.course}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{item.timeLabel}</span>
                    <Badge variant={item.badgeVariant}>{item.badge}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

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

                    const dayAssignments = getAssignmentsForDate(assignments, date).filter(
                      (assignment) => assignment.dueDate >= todayKey,
                    );
                    const dayCalendarEvents = importantCalendarEvents.filter((event) => isSameDay(new Date(event.startTime), date));
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
                          {dayCalendarEvents.slice(0, 1).map((event) => (
                            <div
                              key={event.id}
                              className="truncate rounded border-l-2 border-l-blue-500 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium"
                            >
                              {event.title}
                            </div>
                          ))}
                          {dayAssignments.length > 2 && (
                            <p className="text-[10px] text-muted-foreground">
                              +{dayAssignments.length - 2} more
                            </p>
                          )}
                          {dayCalendarEvents.length > 1 && (
                            <p className="text-[10px] text-muted-foreground">
                              +{dayCalendarEvents.length - 1} calendar event{dayCalendarEvents.length - 1 !== 1 ? "s" : ""}
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
                {selectedAssignments.length !== 1 ? "s" : ""} and {selectedCalendarEvents.length} important
                {selectedCalendarEvents.length !== 1 ? " events" : " event"} scheduled
              </p>
            </div>

            {selectedAssignments.length === 0 && selectedCalendarEvents.length === 0 ? (
              <div className="space-y-4">
                <EmptyState
                  icon={CalendarDays}
                  title="Nothing scheduled"
                  description="No assignments or important events land on this date yet."
                  className="border-0 bg-transparent py-12"
                />
              </div>
            ) : (
              <div className="divide-y divide-border">
                {selectedAssignments.map((a) => (
                  <div key={a.id} className="px-5 py-4">
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
                  </div>
                ))}
                {selectedCalendarEvents.length > 0 && (
                  <div className="px-5 py-4">
                    <h3 className="text-sm font-semibold">Important events</h3>
                    <ul className="mt-3 space-y-2">
                      {selectedCalendarEvents.map((event) => (
                        <li key={event.id} className="rounded-lg border border-border bg-background px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium">{event.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(event.startTime).toLocaleTimeString([], {
                                  hour: "numeric",
                                  minute: "2-digit",
                              })}{" "}
                                -{" "}
                                {new Date(event.endTime).toLocaleTimeString([], {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </p>
                            </div>
                            <Badge variant={event.source === "google-calendar" ? "accent" : event.fixed ? "success" : "default"}>
                              {event.source === "google-calendar"
                                ? "Imported"
                                : event.fixed
                                  ? "Fixed"
                                  : "Study block"}
                            </Badge>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
