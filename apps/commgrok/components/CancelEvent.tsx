"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { btn } from "./ui";
import { ensureOnline, toast } from "./Toaster";

export function CancelEvent({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  async function cancel() {
    if (!ensureOnline()) return;
    setBusy(true);
    const res = await fetch(`/api/events/${eventId}/cancel`, { method: "POST" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast("Couldn't cancel the event", "error");
    toast("Event cancelled", "info");
    router.refresh();
  }
  return confirming ? (
    <div className="flex gap-2">
      <button type="button" onClick={() => setConfirming(false)} className={`${btn.secondary} flex-1`}>
        Keep it
      </button>
      <button type="button" onClick={cancel} disabled={busy} className={`${btn.danger} flex-1`}>
        Yes, cancel event
      </button>
    </div>
  ) : (
    <button type="button" onClick={() => setConfirming(true)} className={`${btn.danger} w-full`}>
      Cancel event
    </button>
  );
}
