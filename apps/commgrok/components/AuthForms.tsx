"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, Loader2, LogOut, Repeat, Inbox, KeyRound } from "lucide-react";
import { Avatar, btn, cx, inputCls } from "./ui";
import { ensureOnline, toast } from "./Toaster";
import type { Team } from "@/lib/types";

type Result = { ok: true; redirect?: string } | { ok: false; status: number; error: string };

async function post(url: string, body: unknown): Promise<Result> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: data?.error || "Something went wrong" };
    return { ok: true, redirect: data?.redirect };
  } catch {
    return { ok: false, status: 0, error: "Couldn't reach the server. Try again." };
  }
}

const withNext = (path: string, next?: string) => (next ? `${path}?next=${encodeURIComponent(next)}` : path);

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-sm font-medium text-bad">
      {children}
    </div>
  );
}

export const DEMO_ACCOUNTS = [
  { email: "tom@commgrok.demo", label: "Tom", team: "Builders Collective", name: "Tom Adeyemi" },
  { email: "maya@commgrok.demo", label: "Maya", team: "Canal Works", name: "Maya Brooks" },
];

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function login(em: string, pw: string, key: string) {
    if (!ensureOnline()) return;
    setBusy(key);
    setError(null);
    const r = await post("/api/auth/login", { email: em, password: pw, next });
    if (!r.ok) {
      setBusy(null);
      setError(r.error);
      return;
    }
    router.replace(r.redirect || "/");
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted">Trying the demo? One tap:</p>
        {DEMO_ACCOUNTS.map((d) => (
          <button
            key={d.email}
            type="button"
            disabled={!!busy}
            onClick={() => login(d.email, "demo1234", d.email)}
            className={cx(btn.secondary, "w-full justify-start gap-3 text-left")}
          >
            {busy === d.email ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <Avatar name={d.name} size={28} />}
            <span>
              Demo: sign in as {d.label} <span className="font-normal text-muted">({d.team})</span>
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-muted">
        <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          login(email, password, "form");
        }}
        className="space-y-4"
      >
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" inputMode="email" className={inputCls} placeholder="you@example.com" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" className={inputCls} />
        </label>
        {error && <ErrorNote>{error}</ErrorNote>}
        <button type="submit" disabled={!!busy} className={`${btn.primary} w-full`}>
          {busy === "form" && <Loader2 aria-hidden className="size-4 animate-spin" />}
          Log in
        </button>
      </form>

      <p className="text-center text-sm text-muted">
        Have an invite code?{" "}
        <Link href={withNext("/signup", next)} className="font-semibold text-accent-text underline-offset-2 hover:underline">
          Create an organiser account
        </Link>
      </p>
    </div>
  );
}

/** Every organiser belongs to exactly one team. There is no "no team" option. */
export function TeamPicker({ teams, value, onChange }: { teams: Team[]; value: string | null; onChange: (id: string) => void }) {
  const options = teams.map((t) => ({ id: t.id, name: t.name, sub: t.role, avatar: t.avatar_url }));
  return (
    <div className="grid gap-2" role="radiogroup">
      {options.map((o) => {
        const active = value === o.id;
        return (
          <label
            key={o.id}
            className={cx(
              "flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border bg-card p-3.5 transition",
              active ? "border-accent ring-2 ring-accent/25" : "border-line hover:bg-subtle",
            )}
          >
            <input type="radio" name="team" checked={active} onChange={() => onChange(o.id)} className="sr-only" />
            <Avatar name={o.name} url={o.avatar} size={40} />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{o.name}</div>
              {o.sub && <div className="text-sm text-muted">{o.sub}</div>}
            </div>
            <span aria-hidden className={cx("flex size-6 items-center justify-center rounded-full border", active ? "border-accent bg-accent text-white" : "border-line")}>
              {active && <Check className="size-4" strokeWidth={3} />}
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function SignupForm({ teams, next }: { teams: Team[]; next?: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [teamId, setTeamId] = useState<string | null>(teams[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ msg: string; status: number } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteCode.trim()) return setError({ msg: "That invite code isn't right. Ask an organiser for it.", status: 400 });
    if (password.length < 8) return setError({ msg: "Password must be at least 8 characters", status: 400 });
    if (!teamId) return setError({ msg: "Pick your team", status: 400 });
    if (!ensureOnline()) return;
    setBusy(true);
    setError(null);
    const r = await post("/api/auth/signup", { name, email, password, inviteCode, teamId, next });
    if (!r.ok) {
      setBusy(false);
      setError({ msg: r.error, status: r.status });
      return;
    }
    router.replace(r.redirect || "/");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-5">
      <label className="block">
        <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
          <KeyRound aria-hidden className="size-4 text-muted" /> Organiser invite code
        </span>
        <input
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          required
          maxLength={200}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className={inputCls}
          placeholder="Ask an organiser on your team"
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Your name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoComplete="name" className={inputCls} placeholder="e.g. Sam Ellis" />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Email</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" inputMode="email" className={inputCls} placeholder="you@example.com" />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Password</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" className={inputCls} placeholder="At least 8 characters" />
      </label>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Your team</legend>
        <TeamPicker teams={teams} value={teamId} onChange={setTeamId} />
      </fieldset>
      {error && (
        <ErrorNote>
          {error.msg}
          {error.status === 409 && (
            <>
              {" "}
              <Link href={withNext("/login", next)} className="underline underline-offset-2">
                Log in
              </Link>
            </>
          )}
        </ErrorNote>
      )}
      <button type="submit" disabled={busy} className={`${btn.primary} w-full`}>
        {busy && <Loader2 aria-hidden className="size-4 animate-spin" />}
        Create account
      </button>
      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href={withNext("/login", next)} className="font-semibold text-accent-text underline-offset-2 hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}

export function JoinTeamForm({ teams, current, next }: { teams: Team[]; current: string | null; next?: string }) {
  const router = useRouter();
  const [teamId, setTeamId] = useState<string | null>(current ?? teams[0]?.id ?? null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!teamId) return toast("Pick a team", "error");
    if (!ensureOnline()) return;
    setBusy(true);
    const r = await post("/api/auth/team", { teamId, next });
    if (!r.ok) {
      setBusy(false);
      return toast(r.error, "error");
    }
    toast(`You're on ${teams.find((t) => t.id === teamId)?.name ?? "the team"}`, "success");
    router.replace(r.redirect || "/approvals");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-5">
      <TeamPicker teams={teams} value={teamId} onChange={setTeamId} />
      <button type="submit" disabled={busy || !teamId} className={`${btn.primary} w-full`}>
        {busy && <Loader2 aria-hidden className="size-4 animate-spin" />}
        {current ? "Save" : "Continue"}
      </button>
    </form>
  );
}

/**
 * Logged-in organiser: an "Approvals" link button (hidden on /approvals itself) plus the avatar menu.
 * compact = icon-only Approvals button, for headers that already carry another button.
 */
export function UserMenuButton({ name, email, teamName, compact = false }: { name: string; email: string; teamName: string | null; compact?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function logout() {
    setOpen(false);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    toast("Logged out", "info");
    router.push("/");
    router.refresh();
  }

  const item = "flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-[15px] font-medium text-fg transition hover:bg-subtle";

  return (
    <div className="flex items-center gap-2">
      {pathname !== "/approvals" && (
        <Link href="/approvals" className={btn.small} aria-label={compact ? "Approvals" : undefined} title={compact ? "Approvals" : undefined}>
          <Inbox aria-hidden className="size-4" />
          {!compact && "Approvals"}
        </Link>
      )}
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${name}`}
        onClick={() => setOpen((v) => !v)}
        className="flex size-11 items-center justify-center rounded-full transition hover:bg-subtle"
      >
        <Avatar name={name} size={32} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-1 w-64 rounded-2xl border border-line bg-card p-1.5 shadow-lg">
          <div className="px-3 pb-2 pt-1.5">
            <div className="text-xs text-muted">Signed in as</div>
            <div className="truncate font-semibold">
              {name}
              <span className="font-normal text-muted"> · {teamName ?? "No team yet"}</span>
            </div>
            <div className="truncate text-xs text-muted">{email}</div>
          </div>
          <div className="my-1 h-px bg-line" />
          <Link href="/join" role="menuitem" className={item} onClick={() => setOpen(false)}>
            <Repeat aria-hidden className="size-4.5 text-muted" /> {teamName ? "Switch team" : "Choose your team"}
          </Link>
          <button type="button" role="menuitem" onClick={logout} className={item}>
            <LogOut aria-hidden className="size-4.5 text-muted" /> Log out
          </button>
        </div>
      )}
    </div>
    </div>
  );
}
