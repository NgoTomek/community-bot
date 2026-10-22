import { ArrowUp, Loader2 } from "lucide-react";
import { forwardRef, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { usePresenter } from "../../app/presenter";
import { Avatar } from "../../components/Avatar";
import { Tooltip, useGate } from "../../components/ui/Tooltip";
import { useData } from "../../data/DataProvider";
import { errorText } from "../../data/hooks";
import type { Run } from "../../data/types";

export const QUICK_STEERS = ["We can't do that date", "Can we get a bigger space?", "Keep it under 40 people"];

export interface ComposerHandle {
  focus: () => void;
}

/** Text before the caret that is an unfinished @mention, e.g. "@river". */
export function mentionQuery(textBeforeCaret: string): string | null {
  const m = /(?:^|\s)@([\p{L}\p{N}' &.-]{0,40})$/u.exec(textBeforeCaret);
  if (!m) return null;
  return m[1].includes("  ") ? null : m[1];
}

export const Composer = forwardRef<
  ComposerHandle,
  {
    run: Run;
    participants: { id: string; name: string }[];
    myCommunityId: string | null;
    disabledReason: string | null;
  }
>(function Composer({ run, participants, myCommunityId, disabledReason }, ref) {
  const source = useData();
  const { isPresenter, ensurePasscode } = usePresenter();
  const gate = useGate("post_message");
  const [text, setText] = useState("");
  const [asCommunity, setAsCommunity] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caret, setCaret] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);

  const reason = gate.reason ?? disabledReason;
  const canSpeakAsMine = !!myCommunityId && participants.some((p) => p.id === myCommunityId);
  const myName = participants.find((p) => p.id === myCommunityId)?.name;

  const query = mentionQuery(text.slice(0, caret));
  const suggestions = useMemo(() => {
    if (query === null) return [];
    const q = query.trim().toLowerCase();
    return participants.filter((p) => p.name.toLowerCase().startsWith(q) || p.id.startsWith(q)).slice(0, 5);
  }, [query, participants]);

  const send = async (body: string) => {
    const clean = body.trim();
    if (!clean || reason) return;
    setError(null);
    const passcode = await ensurePasscode("Messaging the Bots needs the organiser passcode.");
    if (passcode === false) return;
    setBusy(true);
    try {
      await source.postMessage(passcode, run.id, clean, asCommunity);
      setText("");
      setCaret(0);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const pickMention = (name: string) => {
    const before = text.slice(0, caret).replace(/@[^@]*$/, `@${name} `);
    const next = before + text.slice(caret);
    setText(next);
    setCaret(before.length);
    setMentionIndex(0);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(before.length, before.length);
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setMentionIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setMentionIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        pickMention(suggestions[Math.min(mentionIndex, suggestions.length - 1)].name);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(text);
    }
  };

  return (
    <div className="present-hide border-t border-line bg-bg/95 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur supports-[backdrop-filter]:bg-bg/80">
      <div className="mb-2 flex gap-2 overflow-x-auto pb-1 scroll-thin">
        {QUICK_STEERS.map((steer) => (
          <Tooltip key={steer} label={reason}>
            <button type="button" className="chip-btn shrink-0" disabled={!!reason || busy} onClick={() => void send(steer)} title="Send this to the Bots">
              {steer}
            </button>
          </Tooltip>
        ))}
      </div>

      <div className="relative">
        {suggestions.length ? (
          <ul role="listbox" aria-label="Mention a community" className="card absolute bottom-full left-0 z-20 mb-2 w-72 max-w-full p-1" style={{ boxShadow: "var(--shadow-pop)" }}>
            {suggestions.map((p, i) => (
              <li
                key={p.id}
                role="option"
                aria-selected={i === mentionIndex}
                className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm ${i === mentionIndex ? "bg-sunken" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickMention(p.name);
                }}
              >
                <Avatar id={p.id} name={p.name} size={20} />
                {p.name}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="card flex items-end gap-2 p-2 focus-within:border-accent">
          <label htmlFor="composer" className="sr-only">
            Message the Bots
          </label>
          <textarea
            id="composer"
            ref={inputRef}
            rows={1}
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 leading-snug outline-none placeholder:text-faint disabled:cursor-not-allowed"
            placeholder={reason ? reason[0].toUpperCase() + reason.slice(1) : "Message the Bots"}
            value={text}
            disabled={!!reason}
            maxLength={1000}
            onChange={(e) => {
              setText(e.target.value);
              setCaret(e.target.selectionStart);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
            }}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
            onKeyDown={onKeyDown}
            aria-describedby="composer-help"
          />
          <Tooltip label={reason}>
            <button type="button" className="btn btn-primary btn-icon shrink-0" disabled={!text.trim() || busy || !!reason} onClick={() => void send(text)} aria-label="Send">
              {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <ArrowUp size={18} aria-hidden />}
            </button>
          </Tooltip>
        </div>
      </div>

      <div id="composer-help" className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
        {isPresenter ? (
          <label className="flex items-center gap-2">
            Speak as
            <select className="input h-8 min-h-8 w-auto py-0 text-sm" value={asCommunity ?? ""} onChange={(e) => setAsCommunity(e.target.value || null)}>
              <option value="">Human (no community)</option>
              {participants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ) : canSpeakAsMine ? (
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              role="switch"
              className="peer sr-only"
              checked={asCommunity === myCommunityId}
              onChange={(e) => setAsCommunity(e.target.checked ? myCommunityId : null)}
            />
            <span
              className="relative inline-flex h-5 w-9 shrink-0 rounded-full bg-line-strong transition-colors peer-checked:bg-accent-bg peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-surface after:shadow-sm after:transition-transform peer-checked:after:translate-x-4"
              aria-hidden
            />
            Speak as {myName}
          </label>
        ) : null}
        <span className="max-sm:hidden">
          {asCommunity ? "Your message replaces that community's next Bot turn." : "Type @ to address one Bot. Every Bot reads your message before its next turn."}
        </span>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-bad">
          {error}
        </p>
      ) : null}
    </div>
  );
});
