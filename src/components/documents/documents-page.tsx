"use client";

import { useEffect, useState } from "react";
import { FileText, Plus } from "lucide-react";
import { Header } from "@/components/header";
import { useApp } from "@/components/providers/app-provider";
import { DocumentEditor } from "@/components/documents/document-editor";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingScreen } from "@/components/ui/loading";
import { formatTimeAgo } from "@/lib/date";
import { cn } from "@/lib/utils";

export function DocumentsPageContent() {
  const { isLoaded, documents, addDocument, deleteDocument } = useApp();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (documents.length > 0 && !selectedId) {
      setSelectedId(documents[0].id);
    }
    if (selectedId && !documents.find((d) => d.id === selectedId)) {
      setSelectedId(documents[0]?.id ?? null);
    }
  }, [documents, selectedId]);

  if (!isLoaded) return <LoadingScreen />;

  function handleNewNote() {
    const id = addDocument();
    setSelectedId(id);
  }

  return (
    <>
      <Header title="Documents" description="Create, edit, and auto-save your study notes." />

      <main className="flex h-[calc(100vh-4rem)] flex-col p-6">
        {documents.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No notes yet"
            description="Create your first note to start capturing ideas, lecture summaries, and study material."
            action={{ label: "Create Note", onClick: handleNewNote }}
          />
        ) : (
          <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
            <aside className="flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <span className="text-sm font-semibold">Notes</span>
                <Button size="sm" onClick={handleNewNote}>
                  <Plus className="h-3.5 w-3.5" />
                  New
                </Button>
              </div>
              <ul className="flex-1 overflow-y-auto">
                {documents.map((doc) => (
                  <li key={doc.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(doc.id)}
                      className={cn(
                        "w-full border-b border-border px-4 py-3 text-left transition-colors",
                        selectedId === doc.id ? "bg-accent-muted" : "hover:bg-muted/50",
                      )}
                    >
                      <p className="truncate text-sm font-medium">{doc.title || "Untitled Note"}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {doc.content.slice(0, 60) || "Empty note"}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {formatTimeAgo(doc.updatedAt)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </aside>

            {selectedId && (
              <DocumentEditor
                id={selectedId}
                canDelete={documents.length > 1}
                onDelete={() => deleteDocument(selectedId)}
              />
            )}
          </div>
        )}
      </main>
    </>
  );
}
