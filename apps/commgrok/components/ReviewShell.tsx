"use client";

import { useState } from "react";
import { Eye, Pencil } from "lucide-react";
import { EventEditor } from "./EventEditor";
import type { EventRecord } from "@/lib/types";

/** Shows the public preview, with an Edit toggle that swaps in the editor in place. */
export function ReviewShell({ event, canEdit, children }: { event: EventRecord; canEdit: boolean; children: React.ReactNode }) {
  const [editing, setEditing] = useState(false);
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
          {editing ? <Pencil aria-hidden className="size-3.5" /> : <Eye aria-hidden className="size-3.5" />}
          {editing ? "Editing" : "Public preview"}
        </span>
        {canEdit && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-accent-text hover:bg-accent-soft">
            <Pencil aria-hidden className="size-4" /> Edit
          </button>
        )}
      </div>
      {editing ? <EventEditor key={event.revision} mode={{ kind: "edit", event, onDone: () => setEditing(false) }} /> : children}
    </section>
  );
}
