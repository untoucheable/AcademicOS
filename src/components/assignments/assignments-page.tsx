"use client";

import { useState } from "react";
import { CalendarDays, CheckCircle2, ClipboardList, Filter, Plus, X } from "lucide-react";
import { Header } from "@/components/header";
import { useApp } from "@/components/providers/app-provider";
import { AssignmentForm } from "@/components/assignments/assignment-form";
import { AssignmentRow } from "@/components/assignments/assignment-row";
import { Badge, priorityVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingScreen } from "@/components/ui/loading";
import { Modal } from "@/components/ui/modal";
import { filterAssignments } from "@/lib/date";
import type { Assignment, AssignmentFilter } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTERS: { key: AssignmentFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "due-soon", label: "Due Soon" },
  { key: "completed", label: "Completed" },
];

export function AssignmentsPageContent() {
  const {
    isLoaded,
    assignments,
    addAssignment,
    updateAssignment,
    deleteAssignment,
    toggleAssignmentComplete,
  } = useApp();

  const [filter, setFilter] = useState<AssignmentFilter>("all");
  const [dueDateFilter, setDueDateFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [showDateFilter, setShowDateFilter] = useState(false);

  if (!isLoaded) return <LoadingScreen />;

  const filtered = filterAssignments(assignments, filter, dueDateFilter || undefined);

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(assignment: Assignment) {
    setEditing(assignment);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  function handleDelete(id: string) {
    const assignment = assignments.find((item) => item.id === id);
    const label = assignment ? `"${assignment.title}"` : "this assignment";
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    deleteAssignment(id);
  }

  return (
    <>
      <Header title="Assignments" description="Track and manage all your coursework in one place." />

      <main className="p-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  filter === key
                    ? "bg-accent text-accent-foreground"
                    : "bg-card text-muted-foreground ring-1 ring-border hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="md" onClick={() => setShowDateFilter((v) => !v)}>
              <Filter className="h-4 w-4" />
              Filter by date
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              New Assignment
            </Button>
          </div>
        </div>

        {showDateFilter && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-border bg-card p-3">
            <label htmlFor="due-filter" className="text-sm font-medium">
              Due on:
            </label>
            <input
              id="due-filter"
              type="date"
              value={dueDateFilter}
              onChange={(e) => setDueDateFilter(e.target.value)}
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            {dueDateFilter && (
              <Button variant="ghost" size="sm" onClick={() => setDueDateFilter("")}>
                <X className="h-4 w-4" />
                Clear
              </Button>
            )}
          </div>
        )}

        {filtered.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No assignments found"
            description={
              assignments.length === 0
                ? "Create your first assignment to start tracking deadlines."
                : "Try adjusting your filters to see more assignments."
            }
            action={
              assignments.length === 0
                ? { label: "Create Assignment", onClick: openCreate }
                : undefined
            }
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Assignment</th>
                  <th className="hidden px-5 py-3 font-medium text-muted-foreground md:table-cell">
                    Due Date
                  </th>
                  <th className="hidden px-5 py-3 font-medium text-muted-foreground lg:table-cell">
                    Priority
                  </th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((assignment) => (
                  <AssignmentRow
                    key={assignment.id}
                    assignment={assignment}
                    onToggleComplete={toggleAssignmentComplete}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? "Edit Assignment" : "New Assignment"}
        description={editing ? "Update assignment details." : "Add a new assignment to track."}
      >
        <AssignmentForm
          initial={editing ?? undefined}
          submitLabel={editing ? "Save Changes" : "Create Assignment"}
          onCancel={closeModal}
          onSubmit={(data) => {
            if (editing) {
              updateAssignment(editing.id, data);
            } else {
              addAssignment(data);
            }
            closeModal();
          }}
        />
      </Modal>
    </>
  );
}

export function AssignmentListCompact({
  items,
  emptyMessage,
}: {
  items: Assignment[];
  emptyMessage: string;
}) {
  const { toggleAssignmentComplete } = useApp();

  if (items.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/20"
        >
          <button
            type="button"
            onClick={() => toggleAssignmentComplete(item.id)}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted",
              item.completed && "bg-emerald-500/10",
            )}
          >
            {item.completed ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "truncate font-medium",
                item.completed && "line-through text-muted-foreground",
              )}
            >
              {item.title}
            </p>
            <p className="truncate text-sm text-muted-foreground">{item.course}</p>
          </div>
          <Badge variant={priorityVariant(item.priority)} className="hidden sm:inline-flex">
            {item.priority}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
