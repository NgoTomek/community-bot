import Link from "next/link";
import type { ReactNode } from "react";
import { APP_NAME } from "@/lib/config";
import { monthShort, dayNum } from "@/lib/time";
import type { EventStatus, EventType, TeamApprovalState } from "@/lib/types";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// Shared press feel: quick ease-out, slight shrink on press, no layout shift.
// (Tailwind v4 `scale-*` uses the standalone `scale` property, so it must be listed in the transition.)
const press =
  "transition-[scale,transform,filter,background-color,border-color,box-shadow,color] duration-150 ease-out active:scale-[0.97] active:duration-75";

export const btn = {
  primary: cx(
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-animated px-5 text-[15px] font-semibold text-accent-fg",
    "shadow-[0_6px_20px_-8px_rgb(124_58_237/0.6),inset_0_1px_0_rgb(255_255_255/0.18)] hover:brightness-110 hover:shadow-[0_10px_26px_-8px_rgb(219_39_119/0.55),inset_0_1px_0_rgb(255_255_255/0.2)]",
    press,
    "disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none",
  ),
  secondary: cx(
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line bg-card px-5 text-[15px] font-semibold text-fg hover:border-accent/40 hover:bg-subtle",
    press,
    "disabled:pointer-events-none disabled:opacity-50",
  ),
  small: cx(
    "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-3.5 text-sm font-medium text-fg hover:border-accent/40 hover:bg-subtle",
    press,
  ),
  danger: cx(
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-bad/40 bg-bad-soft px-5 text-[15px] font-semibold text-bad hover:border-bad/70",
    press,
    "disabled:opacity-50",
  ),
};

export const inputCls =
  "block w-full min-h-12 rounded-xl border border-line bg-card px-3.5 py-2.5 text-[16px] text-fg placeholder:text-muted/70 transition-[border-color,box-shadow] focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20";

export const TYPE_LABEL: Record<EventType, string> = {
  meetup: "Meetup",
  talk: "Talk",
  workshop: "Workshop",
  social: "Social",
  hackathon: "Hackathon",
  other: "Event",
};

/** Per-type colour classes. Literal strings so Tailwind picks them up. */
export const TYPE_STYLE: Record<EventType, { chip: string; band: string; dot: string; thumb: string }> = {
  meetup: { chip: "bg-t-meetup-soft text-t-meetup-fg", band: "bg-t-meetup", dot: "bg-t-meetup", thumb: "from-t-meetup to-accent" },
  talk: { chip: "bg-t-talk-soft text-t-talk-fg", band: "bg-t-talk", dot: "bg-t-talk", thumb: "from-warm to-t-talk" },
  workshop: { chip: "bg-t-workshop-soft text-t-workshop-fg", band: "bg-t-workshop", dot: "bg-t-workshop", thumb: "from-t-workshop to-t-meetup" },
  social: { chip: "bg-t-social-soft text-t-social-fg", band: "bg-t-social", dot: "bg-t-social", thumb: "from-accent-2 to-warm" },
  hackathon: { chip: "bg-t-hackathon-soft text-t-hackathon-fg", band: "bg-t-hackathon", dot: "bg-t-hackathon", thumb: "from-t-hackathon to-t-workshop" },
  other: { chip: "bg-t-other-soft text-t-other-fg", band: "bg-t-other", dot: "bg-t-other", thumb: "from-accent to-accent-2" },
};

export function TypeChip({ type, size = "md" }: { type: EventType; size?: "sm" | "md" }) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold leading-none",
        size === "sm" ? "px-2 py-[3px] text-[11px]" : "px-2.5 py-1 text-xs",
        TYPE_STYLE[type].chip,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-80" />
      {TYPE_LABEL[type]}
    </span>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.55 }}
      className="inline-flex shrink-0 items-center justify-center rounded-[30%] bg-brand font-bold leading-none text-white shadow-[0_4px_14px_-6px_rgb(124_58_237/0.7),inset_0_1px_0_rgb(255_255_255/0.25)]"
    >
      {APP_NAME[0]}
    </span>
  );
}

export function Header({ right }: { right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 bg-bg/80 backdrop-blur-lg backdrop-saturate-150 supports-[backdrop-filter]:bg-bg/65">
      <div className="mx-auto flex h-14 max-w-[520px] items-center justify-between px-4 pt-[env(safe-area-inset-top)]">
        <Link href="/" className="-ml-1 flex min-h-11 items-center gap-2 rounded-lg px-1 text-[15px] font-semibold tracking-tight transition-opacity active:opacity-70">
          <Logo /> {APP_NAME}
        </Link>
        <nav className="flex items-center gap-1">{right}</nav>
      </div>
    </header>
  );
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cx("mx-auto w-full max-w-[520px] px-4 pb-36", className)}>{children}</main>;
}

/** Soft violet/pink/amber mesh glow. Place inside a `relative isolate` parent. */
export function Glow({ className }: { className?: string }) {
  return <div aria-hidden className={cx("mesh-glow grain absolute -z-10", className)} />;
}

export function DateTile({ iso, tz, size = "md", type }: { iso: string; tz: string; size?: "sm" | "md"; type?: EventType }) {
  return (
    <div
      aria-hidden
      className={cx(
        "flex shrink-0 flex-col overflow-hidden rounded-xl border bg-card text-center shadow-[0_1px_2px_rgb(0_0_0/0.04)]",
        type ? "border-transparent ring-1 ring-line" : "border-line",
        size === "sm" ? "w-10" : "w-11",
      )}
    >
      <div
        className={cx(
          "py-0.5 text-[9.5px] font-bold uppercase leading-3.5 tracking-wider",
          type ? cx(TYPE_STYLE[type].band, "text-white") : "bg-subtle text-muted",
        )}
      >
        {monthShort(iso, tz)}
      </div>
      <div className={cx("flex items-center justify-center font-bold leading-none", size === "sm" ? "h-7 text-base" : "h-8 text-lg")}>
        {dayNum(iso, tz)}
      </div>
    </div>
  );
}

export function Chip({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "accent" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium leading-none",
        tone === "accent" ? "bg-accent-soft text-accent-text" : "bg-subtle text-muted",
      )}
    >
      {children}
    </span>
  );
}

export function IconRow({ icon, children, href }: { icon: ReactNode; children: ReactNode; href?: string }) {
  const inner = (
    <>
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-card text-muted transition-colors group-hover:border-accent/40 group-hover:text-accent-text [&_svg]:size-5">
        {icon}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </>
  );
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="group flex items-center gap-3 rounded-xl">
      {inner}
    </a>
  ) : (
    <div className="flex items-center gap-3">{inner}</div>
  );
}

// All AA (>=4.5:1) with white initials.
const AVATAR_COLORS = ["#7c3aed", "#0f766e", "#b45309", "#be185d", "#1d4ed8", "#9333ea", "#15803d", "#c2410c"];
function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
export function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "?";
}

export function Avatar({ name, url, size = 28, ring = false }: { name: string; url?: string | null; size?: number; ring?: boolean }) {
  const style = { width: size, height: size, fontSize: Math.max(10, size * 0.38) };
  const ringCls = ring ? "ring-2 ring-bg" : "";
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" style={style} className={cx("shrink-0 rounded-full object-cover", ringCls)} />;
  }
  return (
    <span
      aria-hidden
      style={{ ...style, background: AVATAR_COLORS[hash(name) % AVATAR_COLORS.length] }}
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white", ringCls)}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ names, size = 28, max = 5 }: { names: string[]; size?: number; max?: number }) {
  return (
    <span className="flex items-center">
      {names.slice(0, max).map((n, i) => (
        <span key={`${n}-${i}`} style={{ marginLeft: i ? -size * 0.3 : 0 }}>
          <Avatar name={n} size={size} ring />
        </span>
      ))}
    </span>
  );
}

export function Cover({ url, title, className }: { url: string | null; title: string; className?: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className={cx("aspect-square w-full rounded-2xl object-cover", className)} />;
  }
  const h = hash(title) % 360;
  return (
    <div
      aria-hidden
      className={cx("relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl text-white grain", className)}
      style={{
        background: `radial-gradient(70% 60% at 20% 20%, hsl(${(h + 40) % 360} 85% 62% / .9), transparent 70%), radial-gradient(60% 60% at 85% 90%, hsl(${(h + 300) % 360} 80% 55% / .9), transparent 70%), linear-gradient(135deg, hsl(${h} 70% 45%), hsl(${(h + 60) % 360} 70% 38%))`,
      }}
    >
      <span className="text-[min(30cqw,5rem)] font-bold opacity-90 drop-shadow-sm">{title.slice(0, 1)}</span>
    </div>
  );
}

export function TeamStatePill({ state }: { state: TeamApprovalState }) {
  const map: Record<TeamApprovalState, [string, string]> = {
    waiting: ["Waiting", "bg-subtle text-muted"],
    approved: ["Accepted", "bg-ok-soft text-ok"],
    rejected: ["Rejected", "bg-bad-soft text-bad"],
    renegotiate: ["Sent back to bots", "bg-warn-soft text-warn"],
    stale: ["Revised — needs re-approval", "bg-warn-soft text-warn"],
  };
  const [label, cls] = map[state];
  return <span className={cx("inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold", cls)}>{label}</span>;
}

export function EventStatusPill({ status }: { status: EventStatus }) {
  const map: Record<EventStatus, [string, string]> = {
    proposed: ["Proposed", "bg-accent-soft text-accent-text"],
    renegotiating: ["Renegotiating", "bg-warn-soft text-warn"],
    rejected: ["Rejected", "bg-bad-soft text-bad"],
    published: ["Published", "bg-ok-soft text-ok"],
    cancelled: ["Cancelled", "bg-bad-soft text-bad"],
  };
  const [label, cls] = map[status];
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", cls)}>{label}</span>;
}

export function ProgressDots({ approved, required }: { approved: number; required: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
      <span className="flex gap-0.5">
        {Array.from({ length: required }).map((_, i) => (
          <span key={i} className={cx("h-1.5 w-4 rounded-full transition-colors", i < approved ? "bg-ok" : "bg-line")} />
        ))}
      </span>
      {approved} of {required} approved
    </span>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{children}</h2>;
}

export function Tabs({ tabs, active }: { tabs: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  return (
    <div role="tablist" className="flex gap-1 rounded-xl border border-line/60 bg-subtle p-1">
      {tabs.map((t) => (
        <Link
          key={t.key}
          role="tab"
          aria-selected={t.key === active}
          href={t.href}
          scroll={false}
          className={cx(
            "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-center text-sm font-medium transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.97]",
            t.key === active ? "bg-card text-fg shadow-[0_1px_3px_rgb(0_0_0/0.08),0_0_0_1px_var(--line)]" : "text-muted hover:text-fg",
          )}
        >
          {t.label}
          {t.count !== undefined && t.count > 0 && (
            <span className={cx("rounded-full px-1.5 text-[11px] font-semibold", t.key === active ? "bg-brand text-white" : "bg-line text-muted")}>
              {t.count}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

/** Skeleton block (shimmer, token colours). */
export function Skel({ className }: { className?: string }) {
  return <div aria-hidden className={cx("skel", className)} />;
}
