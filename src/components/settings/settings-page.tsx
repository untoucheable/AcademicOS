"use client";

import { BookMarked, Moon, User } from "lucide-react";
import { Header } from "@/components/header";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingScreen } from "@/components/ui/loading";
import { Modal } from "@/components/ui/modal";
import { Toggle } from "@/components/ui/toggle";
import { useEffect, useState } from "react";

export function SettingsPageContent() {
  const { isLoaded, settings, profile, updateSettings, updateProfile, resetAllData } = useApp();
  const [username, setUsername] = useState(settings.username);
  const [name, setName] = useState(profile.name);
  const [school, setSchool] = useState(profile.school);
  const [grade, setGrade] = useState(String(profile.grade));
  const [semesterGoal, setSemesterGoal] = useState(String(profile.semesterGoal));
  const [subjects, setSubjects] = useState(profile.subjects.join(", "));
  const [goals, setGoals] = useState(profile.goals.join(", "));
  const [extracurriculars, setExtracurriculars] = useState(profile.extracurriculars.join(", "));
  const [preferredStudyStyle, setPreferredStudyStyle] = useState(profile.preferredStudyStyle);
  const [saved, setSaved] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    if (isLoaded) setUsername(settings.username);
    if (isLoaded) {
      setName(profile.name);
      setSchool(profile.school);
      setGrade(String(profile.grade));
      setSemesterGoal(String(profile.semesterGoal));
      setSubjects(profile.subjects.join(", "));
      setGoals(profile.goals.join(", "));
      setExtracurriculars(profile.extracurriculars.join(", "));
      setPreferredStudyStyle(profile.preferredStudyStyle);
    }
  }, [isLoaded, profile, settings.username]);

  if (!isLoaded) return <LoadingScreen />;

  function handleSaveProfile() {
    updateSettings({ username: username.trim() || "Student" });
    updateProfile({
      name: name.trim() || username.trim() || "Student",
      school: school.trim(),
      grade: Number.isFinite(Number(grade)) ? Number(grade) : profile.grade,
      semesterGoal: Number.isFinite(Number(semesterGoal)) ? Number(semesterGoal) : profile.semesterGoal,
      subjects: subjects.split(",").map((item) => item.trim()).filter(Boolean),
      goals: goals.split(",").map((item) => item.trim()).filter(Boolean),
      extracurriculars: extracurriculars.split(",").map((item) => item.trim()).filter(Boolean),
      preferredStudyStyle,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleResetAllData() {
    setIsResetting(true);
    try {
      await resetAllData();
      setResetOpen(false);
      setSaved(false);
    } finally {
      setIsResetting(false);
    }
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
            <Input
              id="name"
              label="Student Profile Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Student name"
            />
            <Input
              id="school"
              label="School"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              placeholder="School name"
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                id="grade"
                label="Grade"
                type="number"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
              />
              <Input
                id="semesterGoal"
                label="Semester Goal"
                type="number"
                value={semesterGoal}
                onChange={(e) => setSemesterGoal(e.target.value)}
              />
            </div>
            <Input
              id="subjects"
              label="Subjects"
              value={subjects}
              onChange={(e) => setSubjects(e.target.value)}
              placeholder="Math, Biology, English"
            />
            <Input
              id="goals"
              label="Academic Goals"
              value={goals}
              onChange={(e) => setGoals(e.target.value)}
              placeholder="Get a 90 average, improve math"
            />
            <Input
              id="extracurriculars"
              label="Extracurriculars"
              value={extracurriculars}
              onChange={(e) => setExtracurriculars(e.target.value)}
              placeholder="Soccer, band, volunteering"
            />
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Preferred Study Style</p>
              <div className="flex flex-wrap gap-2">
                {[
                  ["practice-problems", "Practice"],
                  ["flashcards", "Flashcards"],
                  ["summaries", "Summaries"],
                  ["videos", "Videos"],
                  ["teaching-back", "Teach Back"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPreferredStudyStyle(value as typeof preferredStudyStyle)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors ${
                      preferredStudyStyle === value
                        ? "bg-accent text-accent-foreground ring-accent/20"
                        : "bg-muted text-muted-foreground ring-border hover:bg-muted/70"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={handleSaveProfile}>Save Profile</Button>
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

        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <BookMarked className="h-4 w-4 text-muted-foreground" />
            </div>
            <h2 className="font-semibold">Mode</h2>
          </div>
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-medium">Workspace Mode</p>
              <p className="text-sm text-muted-foreground">
                Switch between student, teacher, and parent views.
              </p>
            </div>
            <div className="flex gap-2">
              {(["student", "teacher", "parent"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updateSettings({ mode })}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    settings.mode === mode
                      ? "bg-accent text-accent-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-red-200 bg-card shadow-sm">
          <div className="border-b border-red-200 px-5 py-4">
            <h2 className="font-semibold text-red-700">Reset Data</h2>
          </div>
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div>
              <p className="text-sm font-medium">Remove all saved information</p>
              <p className="text-sm text-muted-foreground">
                This clears your assignments, notes, grades, goals, sessions, and synced planner data.
              </p>
            </div>
            <Button variant="danger" onClick={() => setResetOpen(true)}>
              Reset Everything
            </Button>
          </div>
        </section>

        <p className="text-center text-xs text-muted-foreground">
          Your workspace is saved in the browser and the shared AcademicOS database. Use reset to clear both.
        </p>
      </main>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset everything?"
        description="This will erase the current workspace from the app."
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Are you absolutely sure? This will remove your saved information and you will need to start over.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void handleResetAllData()} disabled={isResetting}>
              {isResetting ? "Resetting..." : "Reset"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
