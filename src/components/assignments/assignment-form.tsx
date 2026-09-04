"use client";

import { useState } from "react";
import type { Assignment, AssignmentPriority } from "@/lib/types";
import type { AssignmentAssessmentType, AssignmentStatus } from "@/lib/assignment";
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
  status: AssignmentStatus;
  estimatedMinutes: number;
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
    status: initial?.status ?? (initial?.completed ? "done" : "todo"),
    estimatedMinutes: initial?.estimatedMinutes ?? 45,
    notes: initial?.notes ?? "",
  });
  const [error, setError] = useState("");

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
    onSubmit(form);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
            setForm((f) => ({ ...f, assessmentType: e.target.value as AssignmentAssessmentType }))
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
          label="Estimated Time (minutes)"
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
        <div className="space-y-1.5">
          <label htmlFor="status" className="block text-sm font-medium">
            Status
          </label>
          <select
            id="status"
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as AssignmentStatus }))}
            className="flex h-9 w-full rounded-lg border border-border bg-card px-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          >
            <option value="todo">To Do</option>
            <option value="in-progress">In Progress</option>
            <option value="done">Done</option>
          </select>
        </div>
      </div>
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
