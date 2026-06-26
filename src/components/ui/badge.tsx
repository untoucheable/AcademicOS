import { cn } from "@/lib/utils";

const variants = {
  default: "bg-muted text-muted-foreground ring-border",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/20",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-500/20",
  danger: "bg-red-500/10 text-red-700 dark:text-red-400 ring-red-500/20",
  accent: "bg-accent-muted text-accent ring-accent/20",
};

type BadgeProps = {
  children: React.ReactNode;
  variant?: keyof typeof variants;
  className?: string;
};

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function priorityVariant(priority: string): keyof typeof variants {
  if (priority === "high") return "danger";
  if (priority === "medium") return "warning";
  return "success";
}

export function statusVariant(completed: boolean, overdue: boolean): keyof typeof variants {
  if (completed) return "success";
  if (overdue) return "danger";
  return "accent";
}
