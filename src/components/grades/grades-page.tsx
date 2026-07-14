"use client";

import { useMemo, useState } from "react";
import { BarChart3, Plus, Target, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { Header } from "@/components/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingScreen } from "@/components/ui/loading";
import { Modal } from "@/components/ui/modal";
import { useApp } from "@/components/providers/app-provider";
import { calculateGradeAverage, buildSubjectIntelligence } from "@/lib/academic-analytics";

export function GradesPageContent() {
  const { isLoaded, grades, memory, addGrade, deleteGradeEntry } = useApp();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ subject: string; entryId: string; label: string } | null>(null);
  const [form, setForm] = useState({
    subject: "",
    assignmentName: "",
    score: "",
    maxScore: "100",
    targetAverage: "90",
  });

  const sortedGrades = useMemo(
    () => [...grades].sort((a, b) => calculateGradeAverage(a) - calculateGradeAverage(b)),
    [grades]
  );
  const weakest = sortedGrades[0];
  const strongest = [...sortedGrades].sort(
    (a, b) => calculateGradeAverage(b) - calculateGradeAverage(a)
  )[0];
  const subjectIntel = useMemo(
    () => buildSubjectIntelligence(grades, memory),
    [grades, memory],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setError("");

    try {
      addGrade({
        subject: form.subject,
        assignmentName: form.assignmentName,
        score: Number(form.score),
        maxScore: Number(form.maxScore),
        targetAverage: Number(form.targetAverage),
      });
      setForm({
        subject: "",
        assignmentName: "",
        score: "",
        maxScore: "100",
        targetAverage: form.targetAverage,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Grade update failed.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!isLoaded) return <LoadingScreen />;

  return (
    <>
      <Header title="Grades" description="Track averages, weak subjects, and improvement targets." />

      <main className="space-y-6 p-6">
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-muted">
              <BarChart3 className="h-5 w-5 text-accent" />
            </div>
            <p className="mt-4 text-2xl font-semibold">{grades.length}</p>
            <p className="text-sm font-medium">Tracked Subjects</p>
          </article>
          <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10">
              <TrendingDown className="h-5 w-5 text-red-600" />
            </div>
            <p className="mt-4 text-2xl font-semibold">{weakest?.subject || "None"}</p>
            <p className="text-sm font-medium">Needs Attention</p>
          </article>
          <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            </div>
            <p className="mt-4 text-2xl font-semibold">{strongest?.subject || "None"}</p>
            <p className="text-sm font-medium">Strongest Subject</p>
          </article>
        </section>

        <section className="grid gap-6 xl:grid-cols-[380px_1fr]">
          <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-2">
              <Plus className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold">Add Grade</h2>
            </div>
            <div className="space-y-4">
              <Input
                id="subject"
                label="Subject"
                value={form.subject}
                onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
                placeholder="Math"
              />
              <Input
                id="assignmentName"
                label="Assessment"
                value={form.assignmentName}
                onChange={(e) => setForm((prev) => ({ ...prev, assignmentName: e.target.value }))}
                placeholder="Unit 2 Test"
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  id="score"
                  label="Score"
                  type="number"
                  value={form.score}
                  onChange={(e) => setForm((prev) => ({ ...prev, score: e.target.value }))}
                />
                <Input
                  id="maxScore"
                  label="Out Of"
                  type="number"
                  value={form.maxScore}
                  onChange={(e) => setForm((prev) => ({ ...prev, maxScore: e.target.value }))}
                />
              </div>
              <Input
                id="targetAverage"
                label="Target Average"
                type="number"
                value={form.targetAverage}
                onChange={(e) => setForm((prev) => ({ ...prev, targetAverage: e.target.value }))}
              />
              <Button type="submit" disabled={isSaving} className="w-full">
                {isSaving ? "Saving..." : "Save Grade"}
              </Button>
            </div>
          </form>

          <section className="rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-semibold">Subject Intelligence</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                AcademicOS compares current averages against your target and memory cues.
              </p>
            </div>

            {sortedGrades.length ? (
              <ul className="divide-y divide-border">
                {sortedGrades.map((grade) => {
                  const currentAverage = calculateGradeAverage(grade);
                  const gap = Math.round((grade.targetAverage - currentAverage) * 10) / 10;

                  return (
                    <li key={grade.subject} className="px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium">{grade.subject}</h3>
                            <Badge variant={gap > 8 ? "danger" : gap > 0 ? "warning" : "success"}>
                              {gap > 0 ? `${gap}% to goal` : "On track"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Current {currentAverage}% | Target {grade.targetAverage}%
                          </p>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Target className="h-4 w-4" />
                          {grade.entries.length} grade{grade.entries.length === 1 ? "" : "s"}
                        </div>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${Math.max(0, Math.min(100, currentAverage))}%` }}
                        />
                      </div>
                      {grade.entries.length ? (
                        <div className="mt-4 space-y-2">
                          <p className="text-xs font-medium uppercase text-muted-foreground">
                            Recent entries
                          </p>
                          <ul className="space-y-2">
                            {grade.entries.map((entry) => (
                              <li key={entry.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{entry.assignmentName}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {entry.score}/{entry.maxScore}
                                  </p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    setDeleteTarget({
                                      subject: grade.subject,
                                      entryId: entry.id,
                                      label: entry.assignmentName,
                                    })
                                  }
                                  aria-label={`Delete ${entry.assignmentName}`}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {gap > 0 ? (
                        <p className="mt-3 text-sm text-muted-foreground">
                          Recommended: add focused practice sessions for {grade.subject} until the gap closes.
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                Add your first grade to unlock subject intelligence.
              </p>
            )}
          </section>
        </section>

        {subjectIntel.length ? (
          <section className="rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-semibold">Subject Intelligence Signals</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Memory-informed weak and strong subject tracking.
              </p>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              {subjectIntel.map((subject) => (
                <div key={subject.subject} className="rounded-lg border border-border bg-background p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-medium">{subject.subject}</h3>
                    <Badge
                      variant={
                        subject.status === "at-risk"
                          ? "danger"
                          : subject.status === "watch"
                            ? "warning"
                            : "success"
                      }
                    >
                      {subject.status}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Average {subject.average}% | Target {subject.target}%
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Difficulty {subject.difficulty}/10
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete grade entry?"
        description="This will remove the selected grade entry from your records."
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Remove {deleteTarget?.label || "this entry"} from {deleteTarget?.subject || "the subject"}?
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (!deleteTarget) return;
                deleteGradeEntry(deleteTarget.subject, deleteTarget.entryId);
                setDeleteTarget(null);
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
