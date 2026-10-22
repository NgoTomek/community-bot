"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { btn, cx, inputCls, TYPE_LABEL } from "./ui";
import { ensureOnline, toast } from "./Toaster";
import { DEFAULT_TZ, toZonedInput, zonedToUtc } from "@/lib/time";
import { EVENT_TYPES, type EventRecord } from "@/lib/types";

const COVERS = ["ai-social", "ai-builders", "prompt-clinic", "lightning-talks", "oss-sprint", "canal-run", "breakfast-club"].map((c) => `/covers/${c}.svg`);

type Mode = { kind: "create" } | { kind: "edit"; event: EventRecord; onDone: () => void };

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function EventEditor({ mode }: { mode: Mode }) {
  const router = useRouter();
  const ev = mode.kind === "edit" ? mode.event : null;
  const tz = ev?.timezone ?? DEFAULT_TZ;
  const [cover, setCover] = useState(ev?.cover_url ?? COVERS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const defaultStart = () => {
    const d = new Date(Date.now() + 7 * 86_400_000);
    return `${toZonedInput(d.toISOString(), tz).slice(0, 10)}T18:30`;
  };
  const defaultEnd = () => `${defaultStart().slice(0, 10)}T21:00`;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ensureOnline()) return;
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "").trim();
    const list = (k: string) =>
      s(k)
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    const payload = {
      title: s("title"),
      ...(s("slug") ? { slug: s("slug") } : {}),
      event_type: s("event_type"),
      communities: list("communities"),
      description_md: String(f.get("description_md") ?? ""),
      start_at: zonedToUtc(s("start"), tz).toISOString(),
      end_at: zonedToUtc(s("end"), tz).toISOString(),
      timezone: tz,
      venue_name: s("venue_name") || null,
      venue_address: s("venue_address") || null,
      online_url: s("online_url") || null,
      cover_url: cover || null,
      capacity: s("capacity") ? Number(s("capacity")) : null,
      price_label: s("price_label") || "Free",
      hosts: list("hosts").map((name) => ({ name })),
      visibility: s("visibility") || "public",
    };
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(mode.kind === "edit" ? `/api/events/${mode.event.id}` : "/api/events", {
        method: mode.kind === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save");
      if (mode.kind === "edit") {
        toast(data.changed?.length ? "Saved. Approvals were reset, so both teams need to approve again." : "No changes", data.changed?.length ? "success" : "info");
        mode.onDone();
        router.refresh();
      } else {
        toast("Proposal created", "success");
        router.push(`/approvals/${data.id}`);
      }
    } catch (e) {
      if (e instanceof TypeError) toast("You're offline. Try again when you're back online.", "offline");
      else setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <span className="mb-1.5 block text-sm font-medium">Cover</span>
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {COVERS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Use cover ${c.split("/").pop()}`}
              aria-pressed={cover === c}
              onClick={() => setCover(c)}
              className={cx("size-16 shrink-0 overflow-hidden rounded-xl border-2 transition", cover === c ? "border-accent" : "border-transparent opacity-80 hover:opacity-100")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
        <input value={cover ?? ""} onChange={(e) => setCover(e.target.value)} className={cx(inputCls, "mt-2 text-sm")} placeholder="or paste an image URL" aria-label="Cover image URL" />
      </div>

      <Field label="Title">
        <input name="title" required minLength={3} maxLength={140} defaultValue={ev?.title} className={cx(inputCls, "text-lg font-semibold")} placeholder="AI Builders Social" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <select name="event_type" defaultValue={ev?.event_type ?? "meetup"} className={inputCls}>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Visibility">
          <select name="visibility" defaultValue={ev?.visibility ?? "public"} className={inputCls}>
            <option value="public">Public</option>
            <option value="unlisted">Unlisted</option>
          </select>
        </Field>
      </div>

      <Field label="Communities" hint="Comma separated">
        <input name="communities" defaultValue={ev?.communities.join(", ")} className={inputCls} placeholder="Builders Collective, Women Who Ship" />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Starts (London time)">
          <input name="start" type="datetime-local" required defaultValue={ev ? toZonedInput(ev.start_at, tz) : defaultStart()} className={inputCls} />
        </Field>
        <Field label="Ends">
          <input name="end" type="datetime-local" required defaultValue={ev ? toZonedInput(ev.end_at, tz) : defaultEnd()} className={inputCls} />
        </Field>
      </div>

      <Field label="Venue">
        <input name="venue_name" defaultValue={ev?.venue_name ?? ""} className={inputCls} placeholder="Canal Works" />
      </Field>
      <Field label="Address" hint="Linked to Google Maps on the event page">
        <input name="venue_address" defaultValue={ev?.venue_address ?? ""} className={inputCls} placeholder="12 Wharf Road, London N1 7GR" />
      </Field>
      <Field label="Online link (optional)">
        <input name="online_url" type="url" defaultValue={ev?.online_url ?? ""} className={inputCls} placeholder="https://meet.example.com/..." />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Capacity" hint="Blank = no limit">
          <input name="capacity" type="number" min={1} inputMode="numeric" defaultValue={ev?.capacity ?? ""} className={inputCls} placeholder="80" />
        </Field>
        <Field label="Price">
          <input name="price_label" defaultValue={ev?.price_label ?? "Free"} className={inputCls} />
        </Field>
      </div>

      <Field label="Hosts" hint="Comma separated names">
        <input name="hosts" defaultValue={ev?.hosts.map((h) => h.name).join(", ")} className={inputCls} placeholder="Tom Adeyemi, Maya Brooks" />
      </Field>

      <Field label="Description" hint="Markdown supported">
        <textarea name="description_md" rows={7} defaultValue={ev?.description_md} className={cx(inputCls, "leading-relaxed")} />
      </Field>

      <Field label="Link" hint={`/e/${ev?.slug ?? "generated-from-title"}`}>
        <input name="slug" defaultValue={ev?.slug ?? ""} pattern="[a-z0-9]+(-[a-z0-9]+)*" className={cx(inputCls, "font-mono text-sm")} placeholder="leave blank to generate" />
      </Field>

      {err && (
        <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
          {err}
        </p>
      )}

      <div className="flex gap-2">
        {mode.kind === "edit" && (
          <button type="button" onClick={mode.onDone} className={`${btn.secondary} flex-1`}>
            Cancel
          </button>
        )}
        <button type="submit" disabled={busy} className={`${btn.primary} flex-[2]`}>
          {busy && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {mode.kind === "edit" ? "Save changes" : "Create proposal"}
        </button>
      </div>
      {mode.kind === "edit" && <p className="text-center text-xs text-muted">Saving resets every team&apos;s approval, so nobody approves something they haven&apos;t seen.</p>}
    </form>
  );
}
