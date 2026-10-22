import type { Card } from "@community-bots/core";
import { AnimatePresence, motion } from "framer-motion";
import {
  BadgeCheck,
  CircleCheck,
  CircleX,
  FileText,
  MessageSquareWarning,
  RefreshCw,
  Square,
  TriangleAlert,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "../../components/Avatar";
import { BotTag, StanceChip, YouTag } from "../../components/Badges";
import { EvidenceChip } from "../../components/EvidenceChip";
import type { Message } from "../../data/types";
import { clockTime } from "../../lib/format";
import type { TimelineEventKind, TimelineItem } from "../../lib/timeline";

export interface TimelineProps {
  items: TimelineItem[];
  cards: Record<string, Card | undefined>;
  names: Record<string, string>;
  /** Community whose Bot is writing now. */
  typing?: string | null;
  myCommunityIds?: string[];
  onOpenDeal?: (round: number) => void;
}

/** The conversation: Bot posts, human messages and system events, newest last. */
export function Timeline({ items, cards, names, typing, myCommunityIds = [], onOpenDeal }: TimelineProps) {
  return (
    <>
      <ol className="space-y-3" aria-label="Conversation">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.li
              key={item.key}
              layout="position"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              {item.kind === "message" ? (
                <PostCard message={item.message} cards={cards} names={names} mine={myCommunityIds.includes(item.message.communityId)} />
              ) : (
                <SystemEvent item={item} onOpenDeal={onOpenDeal} />
              )}
            </motion.li>
          ))}
          {typing ? (
            <motion.li key={`typing:${typing}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <TypingRow communityId={typing} name={names[typing] ?? typing} />
            </motion.li>
          ) : null}
        </AnimatePresence>
      </ol>
      <LiveAnnouncer items={items} names={names} />
    </>
  );
}

export function PostCard({ message, cards, names, mine = false }: { message: Message; cards: Record<string, Card | undefined>; names: Record<string, string>; mine?: boolean }) {
  const name = names[message.communityId] ?? message.speaker.replace(/ Bot$/, "");
  const time = clockTime(message.createdAt);

  if (message.role === "human") {
    const speakingFor = message.communityId ? (names[message.communityId] ?? message.communityId) : null;
    return (
      <article className="ml-6 rounded-xl border border-line/70 bg-human px-4 py-3 sm:ml-12" aria-label={speakingFor ? `Human, speaking for ${speakingFor}` : "Human"}>
        <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <UserRound size={15} className="text-muted" aria-hidden />
          <span className="font-medium">Human</span>
          {speakingFor ? <span className="text-muted">speaking for {speakingFor}</span> : null}
          {mine ? <YouTag /> : null}
          <time className="ml-auto text-xs tabular text-faint" dateTime={message.createdAt}>
            {time}
          </time>
        </header>
        <p className="mt-1 whitespace-pre-wrap leading-relaxed">{message.text}</p>
      </article>
    );
  }

  return (
    <article className="card p-4" aria-label={`${name} Bot${message.stance ? `, ${message.stance}` : ""}`}>
      <div className="flex gap-3">
        <Avatar id={message.communityId} name={name} size={36} />
        <div className="min-w-0 flex-1">
          <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium leading-tight">{name}</span>
            <BotTag />
            {message.stance ? <StanceChip stance={message.stance} /> : null}
            <time className="ml-auto text-xs tabular text-faint" dateTime={message.createdAt}>
              {time}
            </time>
          </header>
          <p className="mt-1.5 whitespace-pre-wrap leading-relaxed">{message.text}</p>
          <div className="mt-3">
            <EvidenceChip quote={message.evidence?.quote} preferredId={message.communityId} cards={cards} names={names} />
          </div>
        </div>
      </div>
    </article>
  );
}

const EVENT_STYLE: Record<TimelineEventKind, { icon: LucideIcon; cls: string }> = {
  round: { icon: RefreshCw, cls: "bg-accent-soft text-accent" },
  deal: { icon: FileText, cls: "bg-accent-soft text-accent" },
  renegotiate: { icon: MessageSquareWarning, cls: "bg-warn-soft text-warn" },
  declined: { icon: CircleX, cls: "bg-bad-soft text-bad" },
  approved: { icon: CircleCheck, cls: "bg-ok-soft text-ok" },
  confirmed: { icon: BadgeCheck, cls: "bg-ok-soft text-ok" },
  stopped: { icon: Square, cls: "bg-sunken text-muted" },
  error: { icon: TriangleAlert, cls: "bg-bad-soft text-bad" },
};

export function SystemEvent({ item, onOpenDeal }: { item: Extract<TimelineItem, { kind: "event" }>; onOpenDeal?: (round: number) => void }) {
  const style = EVENT_STYLE[item.event];
  const Icon = style.icon;
  return (
    <div className="flex items-start gap-3 px-1 py-1" role="note">
      <span className={`grid size-7 shrink-0 place-items-center rounded-full ${style.cls}`} aria-hidden>
        <Icon size={14} />
      </span>
      <p className="min-w-0 pt-1 text-sm leading-relaxed">
        <span className="font-medium">{item.text}</span>
        {item.note ? <span className="text-muted">: “{item.note}”</span> : null}
        {item.event === "deal" && onOpenDeal ? (
          <button type="button" className="ml-2 font-medium text-accent hover:underline" onClick={() => onOpenDeal(item.round)}>
            View deal
          </button>
        ) : null}
      </p>
    </div>
  );
}

export function TypingRow({ communityId, name }: { communityId: string; name: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-line-strong px-4 py-3 text-sm text-muted" aria-hidden>
      <span className="opacity-70">
        <Avatar id={communityId} name={name} size={28} />
      </span>
      <span>{name} Bot is writing</span>
      <span className="typing-dots text-faint">
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}

/** Screen readers hear each new post once, politely. */
function LiveAnnouncer({ items, names }: { items: TimelineItem[]; names: Record<string, string> }) {
  const [text, setText] = useState("");
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const keys = new Set(items.map((i) => i.key));
    if (seen.current) {
      const fresh = items.filter((i) => !seen.current!.has(i.key));
      const last = fresh[fresh.length - 1];
      if (last) {
        if (last.kind === "message") {
          const who = last.message.role === "bot" ? `${names[last.message.communityId] ?? last.message.speaker} Bot` : "A human";
          setText(`New post from ${who}: ${last.message.text}`);
        } else {
          setText(last.text + (last.note ? `: ${last.note}` : ""));
        }
      }
    }
    seen.current = keys;
  }, [items, names]);
  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {text}
    </div>
  );
}
