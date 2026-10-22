import { MapPin, Users, Video, Ticket } from "lucide-react";
import { AvatarStack, Chip, Cover, DateTile, Glow, IconRow, SectionLabel, TypeChip } from "./ui";
import { Markdown } from "./Markdown";
import { longDate, timeRange, zoneLabel } from "@/lib/time";
import { mapsUrl } from "@/lib/links";
import type { EventRecord, RsvpSummary } from "@/lib/types";

function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

/** The public event layout. Also used as the "exactly as it will look" preview on the review screen. */
export function EventDetail({ event, rsvp }: { event: EventRecord; rsvp: RsvpSummary }) {
  const tz = event.timezone;
  const left = event.capacity == null ? null : Math.max(0, event.capacity - rsvp.going);
  return (
    <article className="space-y-6">
      <div className="relative isolate">
        {event.cover_url ? (
          // Blurred copy of the cover as a colour-matched glow (Luma-style).
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.cover_url} alt="" aria-hidden className="absolute inset-x-6 bottom-0 top-8 -z-10 h-[calc(100%-2rem)] w-[calc(100%-3rem)] rounded-3xl object-cover opacity-60 blur-2xl saturate-150 dark:opacity-45" />
        ) : (
          <Glow className="-inset-x-4 -top-6 bottom-0" />
        )}
        <Cover url={event.cover_url} title={event.title} className="shadow-[0_20px_40px_-24px_rgb(0_0_0/0.45)] ring-1 ring-black/5 dark:ring-white/10" />
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          <TypeChip type={event.event_type} />
          {event.communities.map((c) => (
            <Chip key={c}>{c}</Chip>
          ))}
        </div>
        <h1 className="text-[28px] font-bold leading-[1.15] tracking-tight sm:text-[32px]">{event.title}</h1>
      </div>

      <div className="space-y-3.5">
        <div className="flex items-center gap-3">
          <DateTile iso={event.start_at} tz={tz} type={event.event_type} />
          <div className="min-w-0">
            <div className="font-semibold">{longDate(event.start_at, tz)}</div>
            <div className="text-sm text-muted">
              {timeRange(event.start_at, event.end_at, tz)} {zoneLabel(event.start_at, tz)}
            </div>
          </div>
        </div>

        {(event.venue_name || event.venue_address) && (
          <IconRow icon={<MapPin aria-hidden />} href={mapsUrl(event)}>
            <div className="flex items-center gap-1 font-semibold group-hover:underline">{event.venue_name ?? event.venue_address}</div>
            {event.venue_name && event.venue_address && <div className="truncate text-sm text-muted">{event.venue_address}</div>}
          </IconRow>
        )}

        {event.online_url && (
          <IconRow icon={<Video aria-hidden />} href={event.online_url}>
            <div className="font-semibold group-hover:underline">Online</div>
            <div className="truncate text-sm text-muted">{event.online_url.replace(/^https?:\/\//, "")}</div>
          </IconRow>
        )}

        {event.hosts.length > 0 && (
          <IconRow icon={<Users aria-hidden />}>
            <div className="text-sm text-muted">Hosted by</div>
            <div className="flex items-center gap-2">
              <AvatarStack names={event.hosts.map((h) => h.name)} size={22} />
              <span className="truncate font-semibold">{joinNames(event.hosts.map((h) => h.name))}</span>
            </div>
          </IconRow>
        )}
      </div>

      <section className="rounded-2xl border border-line bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-semibold">
              <Ticket aria-hidden className="size-4 text-muted" />
              {rsvp.going} going
              {rsvp.waitlist > 0 && <span className="font-normal text-muted">· {rsvp.waitlist} on waitlist</span>}
            </div>
            <div className="mt-0.5 text-sm text-muted">
              {left == null ? "No capacity limit" : left === 0 ? "Full: join the waitlist" : `${left} of ${event.capacity} spots left`} ·{" "}
              {event.price_label}
            </div>
          </div>
          {rsvp.firstNames.length > 0 && <AvatarStack names={rsvp.firstNames} size={30} max={5} />}
        </div>
        {rsvp.firstNames.length > 0 && (
          <p className="mt-3 text-sm text-muted">
            {rsvp.firstNames.slice(0, 3).join(", ")}
            {rsvp.going > 3 ? ` and ${rsvp.going - 3} others` : ""}
          </p>
        )}
      </section>

      {event.description_md.trim() && (
        <section>
          <SectionLabel>About</SectionLabel>
          <Markdown>{event.description_md}</Markdown>
        </section>
      )}
    </article>
  );
}
