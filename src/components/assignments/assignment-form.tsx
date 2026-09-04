"use client";

import { useState } from "react";
import type { Assignment, AssignmentPriority } from "@/lib/types";
import { isAssessmentPrepType, usesProgressTracking, type AssignmentAssessmentType } from "@/lib/assignment";
import { toDateKey } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type AssignmentFormData = {
  title: string;
  course: string;
  assessmentType: AssignmentAssessmentType;
  dueDate: string;
  priority: AssignmentPriority;
  estimatedMinutes: number;
  progressPercent: number;
  studyMinutesCompleted: number;
  notes: string;
};

type AssignmentFormProps = {
  initial?: Partial<Assignment>;
  onSubmit: (data: AssignmentFormData) => void;
  onCancel: () => void;
  submitLabel?: string;
};

export function AssignmentForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel = "Save Assignment",
}: AssignmentFormProps) {
  const [form, setForm] = useState<AssignmentFormData>({
    title: initial?.title ?? "",
    course: initial?.course ?? "",
    assessmentType: initial?.assessmentType ?? "assignment",
    dueDate: initial?.dueDate ?? toDateKey(new Date()),
    priority: initial?.priority ?? "medium",
    estimatedMinutes: initial?.estimatedMinutes ?? 45,
    progressPercent: initial?.progress?.percentComplete ?? 0,
    studyMinutesCompleted: initial?.progress?.studyMinutesCompleted ?? 0,
    notes: initial?.notes ?? "",
  });
  const [error, setError] = useState("");
  const isAssessmentPrep = isAssessmentPrepType(form.assessmentType);
  const tracksProgress = usesProgressTracking(form.assessmentType);
  const timeLabel = isAssessmentPrep ? "Total Target Study Time (minutes)" : "Estimated Time To Finish (minutes)";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    if (!form.course.trim()) {
      setError("Course is required");
      return;
    }
    if (!Number.isFinite(form.estimatedMinutes) || form.estimatedMinutes <= 0) {
      setError("Estimated time must be greater than zero");
      return;
    }
    if (tracksProgress && (!Number.isFinite(form.progressPercent) || form.progressPercent < 0 || form.progressPercent > 100)) {
      setError("Progress must be between 0 and 100");
      return;
    }
    if (isAssessmentPrep && (!Number.isFinite(form.studyMinutesCompleted) || form.studyMinutesCompleted < 0)) {
      setError("Studied minutes must be zero or greater");
      return;
    }
    if (isAssessmentPrep && form.studyMinutesCompleted > form.estimatedMinutes) {
      setError("Studied minutes cannot be greater than the total study target");
      return;
    }
    onSubmit({
      ...form,
      progressPercent: tracksProgress ? form.progressPercent : 0,
      studyMinutesCompleted: isAssessmentPrep ? form.studyMinutesCompleted : 0,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}
      <Input
        id="title"
        label="Title"
        placeholder="Problem Set 4 - Binary Trees"
        value={form.title}
        onChange={(e) => {
          setError("");
          setForm((f) => ({ ...f, title: e.target.value }));
        }}
        error={error && !form.title.trim() ? error : undefined}
      />
      <Input
        id="course"
        label="Course"
        placeholder="CS 201 · Data Structures"
        value={form.course}
        onChange={(e) => {
          setError("");
          setForm((f) => ({ ...f, course: e.target.value }));
        }}
      />
      <div className="space-y-1.5">
        <label htmlFor="assessmentType" className="block text-sm font-medium">
          Type
        </label>
        <select
          id="assessmentType"
          value={form.assessmentType}
          onChange={(e) =>
            setForm((f) => {
              const nextType = e.target.value as AssignmentAssessmentType;
              return {
                ...f,
                assessmentType: nextType,
                progressPercent: usesProgressTracking(nextType) ? f.progressPercent : 0,
                studyMinutesCompleted: isAssessmentPrepType(nextType) ? f.studyMinutesCompleted : 0,
              };
            })
          }
          className="flex h-9 w-full rounded-lg border border-border bg-card px-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        >
          <option value="assignment">Assignment</option>
          <option value="homework">Homework</option>
          <option value="test">Test</option>
          <option value="quiz">Quiz</option>
          <option value="project">Project</option>
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          id="dueDate"
          label="Due Date"
          type="date"
          value={form.dueDate}
          onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
        />
        <div className="space-y-1.5">
          <label htmlFor="priority" className="block text-sm font-medium">
            Priority
          </label>
          <select
            id="priority"
            value={form.priority}
            onChange={(e) =>
              setForm((f) => ({ ...f, priority: e.target.value as AssignmentPriority }))
            }
            className="flex h-9 w-full rounded-lg border border-border bg-card px-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          id="estimatedMinutes"
          label={timeLabel}
          type="number"
          min={1}
          step={5}
          value={String(form.estimatedMinutes)}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              estimatedMinutes: Number.parseInt(e.target.value, 10) || 0,
            }))
          }
        />
        {tracksProgress ? (
          <Input
            id="progressPercent"
            label="Progress (%)"
            type="number"
            min={0}
            max={100}
            step={5}
            value={String(form.progressPercent)}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                progressPercent: Number.parseInt(e.target.value, 10) || 0,
              }))
            }
          />
        ) : (
          <Input
            id="studyMinutesCompleted"
            label="Minutes Already Studied"
            type="number"
            min={0}
            step={5}
            value={String(form.studyMinutesCompleted)}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                studyMinutesCompleted: Number.parseInt(e.target.value, 10) || 0,
              }))
            }
          />
        )}
      </div>
      {tracksProgress ? null : (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          AcademicOS treats this as total prep time across multiple days, then decides a sensible amount to schedule today based on the due date, priority, and how much prep is still left.
        </div>
      )}
      <Textarea
        id="notes"
        label="Notes (optional)"
        placeholder="Add details, links, or reminders..."
        value={form.notes}
        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        rows={3}
      />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
