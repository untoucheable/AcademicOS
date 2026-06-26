"use client";

import { Check, Pencil, Trash2 } from "lucide-react";
import type { Assignment } from "@/lib/types";
import { formatDate, formatRelativeDue, isPastDue } from "@/lib/date";
import { Badge, priorityVariant, statusVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AssignmentRowProps = {
  assignment: Assignment;
  onToggleComplete: (id: string) => void;
  onEdit: (assignment: Assignment) => void;
  onDelete: (id: string) => void;
};

export function AssignmentRow({
  assignment,
  onToggleComplete,
  onEdit,
  onDelete,
}: AssignmentRowProps) {
  const overdue = !assignment.completed && isPastDue(assignment.dueDate);

  return (
    <tr className="group transition-colors hover:bg-muted/30">
      <td className="px-5 py-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => onToggleComplete(assignment.id)}
            className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
              assignment.completed
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-border hover:border-accent",
            )}
            aria-label={assignment.completed ? "Mark incomplete" : "Mark complete"}
          >
            {assignment.completed && <Check className="h-3 w-3" />}
          </button>
          <div className="min-w-0">
            <p
              className={cn(
                "font-medium",
                assignment.completed && "text-muted-foreground line-through",
              )}
            >
              {assignment.title}
            </p>
            <p className="text-sm text-muted-foreground">{assignment.course}</p>
          </div>
        </div>
      </td>
      <td className="hidden px-5 py-4 md:table-cell">
        <p className="text-sm">{formatDate(assignment.dueDate)}</p>
        <p className={cn("text-xs", overdue ? "text-red-600" : "text-muted-foreground")}>
          {formatRelativeDue(assignment.dueDate)}
        </p>
      </td>
      <td className="hidden px-5 py-4 lg:table-cell">
        <Badge variant={priorityVariant(assignment.priority)}>{assignment.priority}</Badge>
      </td>
      <td className="px-5 py-4">
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant(assignment.completed, overdue)}>
            {assignment.completed ? "Completed" : overdue ? "Overdue" : "Active"}
          </Badge>
          <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
            <Button variant="ghost" size="icon" onClick={() => onEdit(assignment)} aria-label="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(assignment.id)}
              aria-label="Delete"
            >
              <Trash2 className="h-3.5 w-3.5 text-red-500" />
            </Button>
          </div>
        </div>
      </td>
    </tr>
  );
}
