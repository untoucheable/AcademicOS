"use client";

import Link from "next/link";
import { Bell, Sparkles } from "lucide-react";

type HeaderProps = {
  title: string;
  description?: string;
  action?: React.ReactNode;
};

export function Header({ title, description, action }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="flex h-16 items-center justify-between gap-4 px-6">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
          {description && (
            <p className="truncate text-sm text-muted-foreground">{description}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/ai-tutor"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Sparkles className="h-4 w-4 text-accent" />
            <span>Ask AcademicOS</span>
          </Link>
          {action}
          <button
            type="button"
            className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
