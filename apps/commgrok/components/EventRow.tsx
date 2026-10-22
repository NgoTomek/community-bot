import Link from "next/link";
import { MapPin, Video } from "lucide-react";
import { AvatarStack, Chip, TYPE_STYLE, TypeChip, cx } from "./ui";
import { timeOf } from "@/lib/time";
import type { EventRecord, RsvpSummary } from "@/lib/types";

export function EventRow({ event, rsvp, past }: { event: EventRecord; rsvp: RsvpSummary; past?: boolean }) {
  const full = event.capacity != null && rsvp.going >= event.capacity;
  return (
    <Link
      href={`/e/${event.slug}`}
      className="group flex gap-3 rounded-2xl border border-line bg-card p-3.5 shadow-[0_1px_2px_rgb(0_0_0/0.03)] transition-[scale,border-color,background-color,box-shadow] duration-200 ease-out hover:border-accent/30 hover:shadow-[0_8px_24px_-12px_rgb(124_58_237/0.35)] active:scale-[0.985]"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-muted">{timeOf(event.start_at, event.timezone)}</div>
        <div className="mt-0.5 text-[16px] font-semibold leading-snug">{event.title}</div>
        {(event.venue_name || event.online_url) && (
          <div className="mt-1 flex items-center gap-1 text-sm text-muted">
            {event.venue_name ? <MapPin aria-hidden className="size-3.5 shrink-0" /> : <Video aria-hidden className="size-3.5 shrink-0" />}
            <span className="truncate">{event.venue_name ?? "Online"}</span>
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-1">
          <TypeChip type={event.event_type} />
          {event.communities.slice(0, 2).map((c) => (
            <Chip key={c}>{c}</Chip>
          ))}
        </div>
        {rsvp.going > 0 && (
          <div className="mt-2.5 flex items-center gap-2 text-xs font-medium text-muted">
            <AvatarStack names={rsvp.firstNames} size={20} max={3} />
            {rsvp.going} {past ? "went" : "going"}
            {!past && full && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-warn">Waitlist</span>}
          </div>
        )}
      </div>
      {event.cover_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.cover_url} alt="" className="size-20 shrink-0 rounded-xl object-cover ring-1 ring-line/60 transition-transform duration-300 ease-out group-hover:rotate-1 group-hover:scale-[1.03] sm:size-24" />
      ) : (
        <div aria-hidden className={cx("size-20 shrink-0 rounded-xl bg-gradient-to-br sm:size-24", TYPE_STYLE[event.event_type].thumb)} />
      )}
    </Link>
  );
}
