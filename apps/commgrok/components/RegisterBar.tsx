"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Check, Share2, X, Loader2 } from "lucide-react";
import { btn, inputCls } from "./ui";
import { Confetti } from "./Confetti";
import { ensureOnline, toast } from "./Toaster";

type State = "open" | "full" | "ended" | "cancelled";
type Done = { status: "going" | "waitlist"; name: string };

export async function shareOrCopy(title: string, url: string) {
  try {
    if (navigator.share) {
      await navigator.share({ title, url });
      return;
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast("Link copied", "success");
  } catch {
    toast(url, "info");
  }
}

export function RegisterBar({
  eventId,
  title,
  state,
  icsUrl,
  googleUrl,
  url,
}: {
  eventId: string;
  title: string;
  state: State;
  icsUrl: string;
  googleUrl: string;
  url: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [burst, setBurst] = useState(false); // confetti only right after registering, not on re-open

  const nameRef = useRef<HTMLInputElement>(null);
  const key = `cb-rsvp-${eventId}`;

  useEffect(() => {
    try {
      const v = localStorage.getItem(key);
      if (v) setDone(JSON.parse(v));
    } catch {}
  }, [key]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    if (!done) setTimeout(() => nameRef.current?.focus(), 250);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, done]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ensureOnline()) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/events/${eventId}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: fd.get("name"), email: fd.get("email") }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      const d: Done = { status: data.status, name: String(fd.get("name")) };
      setDone(d);
      setBurst(true);
      try {
        localStorage.setItem(key, JSON.stringify(d));
      } catch {}
      router.refresh();
    } catch (e) {
      if (!navigator.onLine || e instanceof TypeError) toast("You're offline. Try again when you're back online.", "offline");
      else setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const label =
    state === "ended" ? "This event has ended" : state === "cancelled" ? "This event was cancelled" : done ? (done.status === "going" ? "You're in" : "You're on the waitlist") : state === "full" ? "Join waitlist" : "Register";

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 backdrop-blur-md">
        <div className="safe-bottom mx-auto flex max-w-[520px] items-center gap-2 px-4 pt-3">
          <button
            type="button"
            disabled={state === "ended" || state === "cancelled"}
            onClick={() => setOpen(true)}
            className={done ? `${btn.secondary} flex-1` : `${btn.primary} flex-1`}
          >
            {done && <Check aria-hidden className="size-4.5 text-ok" />}
            {label}
          </button>
          <button type="button" aria-label="Share event" onClick={() => shareOrCopy(title, url)} className={`${btn.secondary} w-12 px-0`}>
            <Share2 aria-hidden className="size-4.5" />
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={done ? "Registration confirmed" : `Register for ${title}`}>
          <button aria-label="Close" className="fade-in absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="sheet-up safe-bottom absolute inset-x-0 bottom-0 mx-auto max-w-[520px] rounded-t-3xl border border-line bg-card px-5 pt-5 shadow-2xl">
            <div className="mb-1 flex items-start justify-between gap-3">
              <div aria-hidden className="mx-auto -mt-2 mb-3 h-1 w-10 rounded-full bg-line" />
            </div>
            <button aria-label="Close" onClick={() => setOpen(false)} className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-full text-muted hover:bg-subtle">
              <X aria-hidden className="size-5" />
            </button>

            {done ? (
              <div className="pb-4 text-center">
                {burst && done.status === "going" && <Confetti />}
                <div className="pop mx-auto flex size-16 items-center justify-center rounded-full bg-ok-soft text-ok ring-8 ring-ok-soft/40">
                  <Check aria-hidden className="size-8" strokeWidth={3} />
                </div>
                <h2 className="mt-4 text-2xl font-bold tracking-tight">{done.status === "going" ? "You're in" : "You're on the waitlist"}</h2>
                <p className="mx-auto mt-1 max-w-xs text-[15px] text-muted">
                  {done.status === "going"
                    ? `See you there, ${done.name.split(" ")[0]}. Add it to your calendar so you don't forget.`
                    : "We'll email you if a spot opens up."}
                </p>
                <div className="mt-6 grid gap-2">
                  <a href={icsUrl} className={btn.primary}>
                    <CalendarPlus aria-hidden className="size-4.5" /> Add to calendar (.ics)
                  </a>
                  <div className="grid grid-cols-2 gap-2">
                    <a href={googleUrl} target="_blank" rel="noreferrer" className={btn.secondary}>
                      Google Calendar
                    </a>
                    <button type="button" onClick={() => shareOrCopy(title, url)} className={btn.secondary}>
                      <Share2 aria-hidden className="size-4" /> Share
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="pb-4">
                <h2 className="pr-10 text-xl font-bold tracking-tight">{state === "full" ? "Join the waitlist" : "Register"}</h2>
                <p className="mt-1 text-sm text-muted">{title}</p>
                <div className="mt-5 space-y-3">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium">Your name</span>
                    <input ref={nameRef} name="name" required autoComplete="name" maxLength={80} className={inputCls} placeholder="Ada Lovelace" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium">Email</span>
                    <input name="email" type="email" required autoComplete="email" inputMode="email" maxLength={200} className={inputCls} placeholder="you@example.com" />
                  </label>
                </div>
                <p className="mt-3 text-xs text-muted">Only the hosts see your email. Others see your first name.</p>
                {err && (
                  <p role="alert" className="mt-3 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
                    {err}
                  </p>
                )}
                <button type="submit" disabled={busy} className={`${btn.primary} mt-5 w-full`}>
                  {busy && <Loader2 aria-hidden className="size-4 animate-spin" />}
                  {state === "full" ? "Join waitlist" : "Register"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
