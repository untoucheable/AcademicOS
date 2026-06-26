"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

type DocumentEditorProps = {
  id: string;
  canDelete: boolean;
  onDelete: () => void;
};

export function DocumentEditor({ id, canDelete, onDelete }: DocumentEditorProps) {
  const { documents, updateDocument } = useApp();
  const doc = documents.find((d) => d.id === id);
  const [title, setTitle] = useState(doc?.title ?? "");
  const [content, setContent] = useState(doc?.content ?? "");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "idle">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTitle(doc?.title ?? "");
    setContent(doc?.content ?? "");
  }, [id, doc?.title, doc?.content]);

  function scheduleSave(data: { title?: string; content?: string }) {
    setSaveStatus("saving");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateDocument(id, data);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1500);
    }, 400);
  }

  if (!doc) return null;

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <span
          className={`text-xs font-medium transition-opacity ${
            saveStatus === "saving"
              ? "text-muted-foreground"
              : saveStatus === "saved"
                ? "text-emerald-600"
                : "opacity-0"
          }`}
        >
          {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved" : ""}
        </span>
        {canDelete && (
          <Button variant="ghost" size="sm" onClick={onDelete} aria-label="Delete note">
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
        <Input
          id="note-title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            scheduleSave({ title: e.target.value, content });
          }}
          placeholder="Note title"
          className="border-0 bg-transparent px-0 text-lg font-semibold shadow-none focus:ring-0"
        />
        <textarea
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            scheduleSave({ title, content: e.target.value });
          }}
          placeholder="Start writing your notes..."
          className="min-h-[400px] flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  );
}
