import { Megaphone } from "lucide-react";
import { useId } from "react";
import { Avatar } from "../../components/Avatar";
import { BotTag } from "../../components/Badges";
import { CopyButton } from "../../components/CopyButton";
import { EmptyState } from "../../components/ui/States";
import type { EventInfo } from "../../data/types";
import { announcementCopy } from "./logic";

/** Each community's Bot drafts a post for its own members; organisers copy it into their chat. */
export function Announcements({
  items,
  names,
  url,
  confirmed,
}: {
  items: EventInfo["announcements"];
  names: Record<string, string>;
  url: string;
  confirmed: boolean;
}) {
  const id = useId();
  return (
    <section aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="font-display text-2xl leading-tight">
        Announcements to share
      </h2>
      <p className="mt-1 text-sm text-muted">
        Each community's Bot drafted a post for its own members. Organisers can paste it into WhatsApp or Slack.
        {confirmed ? "" : " Wait until every organiser has approved before posting."}
      </p>
      {items.length ? (
        <ul className="mt-4 space-y-3">
          {items.map((a) => {
            const name = names[a.communityId] ?? a.communityId;
            return (
              <li key={a.communityId} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Avatar id={a.communityId} name={name} size={28} />
                  <p className="min-w-0 font-medium">{name}</p>
                  <BotTag />
                </div>
                <p className="mt-1 text-xs text-muted">Drafted by {name}'s Bot for its members</p>
                <p className="mt-3 whitespace-pre-line leading-relaxed">{a.text}</p>
                <div className="mt-4 print:hidden">
                  <CopyButton text={announcementCopy(a.text, url)} label="Copy for WhatsApp or Slack" />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="card mt-4">
          <EmptyState compact icon={<Megaphone size={20} aria-hidden />} title="No announcements yet" body="Each community's Bot writes one once the deal is compiled." />
        </div>
      )}
    </section>
  );
}
