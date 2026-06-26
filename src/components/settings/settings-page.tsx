"use client";

import { Moon, User } from "lucide-react";
import { Header } from "@/components/header";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingScreen } from "@/components/ui/loading";
import { Toggle } from "@/components/ui/toggle";
import { useEffect, useState } from "react";

export function SettingsPageContent() {
  const { isLoaded, settings, updateSettings } = useApp();
  const [username, setUsername] = useState(settings.username);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isLoaded) setUsername(settings.username);
  }, [isLoaded, settings.username]);

  if (!isLoaded) return <LoadingScreen />;

  function handleSaveUsername() {
    updateSettings({ username: username.trim() || "Student" });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <>
      <Header title="Settings" description="Manage your profile and preferences." />

      <main className="mx-auto max-w-2xl space-y-6 p-6">
        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
            <h2 className="font-semibold">Profile</h2>
          </div>
          <div className="space-y-4 p-5">
            <Input
              id="username"
              label="Display Name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your name"
            />
            <div className="flex items-center gap-3">
              <Button onClick={handleSaveUsername}>Save Name</Button>
              {saved && <span className="text-sm text-emerald-600">Saved!</span>}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <Moon className="h-4 w-4 text-muted-foreground" />
            </div>
            <h2 className="font-semibold">Appearance</h2>
          </div>
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-medium">Dark Mode</p>
              <p className="text-sm text-muted-foreground">Switch between light and dark themes</p>
            </div>
            <Toggle
              checked={settings.darkMode}
              onChange={(darkMode) => updateSettings({ darkMode })}
              label="Toggle dark mode"
            />
          </div>
        </section>

        <p className="text-center text-xs text-muted-foreground">
          All data is stored locally in your browser. Clearing site data will reset your workspace.
        </p>
      </main>
    </>
  );
}
