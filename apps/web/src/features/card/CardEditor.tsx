import { DAYS, isGuess, type Card, type Day } from "@community-bots/core";
import { Check, Plus, TriangleAlert, X } from "lucide-react";
import { useId, useMemo, useRef, useState, type Dispatch, type ReactNode, type Ref, type SetStateAction, type TextareaHTMLAttributes } from "react";
import { Link } from "react-router-dom";
import { DAY_NAMES } from "../../lib/constraints";
import { joinNames, plural } from "../../lib/format";
import {
  cardToDraft,
  checkDraft,
  draftGuessCount,
  draftToCard,
  idFromName,
  isBlank,
  markChecked,
  rowKey,
  sameCard,
  stripGuess,
  type CardDraft,
  type DraftCheck,
  type ListItem,
  type RunItem,
} from "./cardForm";
import { GuessMark, SourceLinks } from "./CardView";

export interface CardEditorState extends DraftCheck {
  draft: CardDraft;
  setDraft: Dispatch<SetStateAction<CardDraft>>;
  /** The id the card will be saved under. */
  id: string;
  /** New cards: the id follows the name. */
  idFollowsName: boolean;
  /** Guessed values nobody has checked yet. */
  guesses: number;
  /** The card differs from the one the editor started with. */
  dirty: boolean;
}

/** Form state for a card, validated against CardSchema on every change. Pass `fixedId` for an existing community. */
export function useCardDraft(initial: Card, fixedId?: string): CardEditorState {
  const [draft, setDraft] = useState(() => cardToDraft(initial));
  const [baseline] = useState(() => draftToCard(cardToDraft(initial), fixedId ?? idFromName(initial.name)));
  const idFollowsName = fixedId === undefined;
  const id = fixedId ?? idFromName(draft.name);
  const check = useMemo(() => checkDraft(draft, id, idFollowsName), [draft, id, idFollowsName]);
  const guesses = useMemo(() => draftGuessCount(draft), [draft]);
  return { ...check, draft, setDraft, id, idFollowsName, guesses, dirty: !sameCard(check.card, baseline) };
}

const describedBy = (...ids: (string | false | null | undefined)[]) => ids.filter(Boolean).join(" ") || undefined;

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1.5 flex items-start gap-1.5 text-sm text-bad">
      <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function GuessActions({ id, label, onCheck }: { id: string; label: string; onCheck: () => void }) {
  return (
    <span className="inline-flex items-center gap-1">
      <GuessMark id={id} />
      <button type="button" className="btn btn-ghost btn-sm" onClick={onCheck} aria-label={`Mark ${label} as checked`}>
        <Check size={14} aria-hidden />
        Mark as checked
      </button>
    </span>
  );
}

/** Grows with its content where the browser supports field-sizing. */
function AutoTextarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={1} {...props} className={`input field-sizing-content resize-none ${className}`} />;
}

const guessClass = (value: string) => (isGuess(value) ? "guess rounded-lg!" : "");

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  placeholder,
  multiline = false,
  maxLength,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: ReactNode;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
  required?: boolean;
}) {
  const guess = isGuess(value);
  const props = {
    id,
    value: stripGuess(value),
    placeholder,
    maxLength,
    required,
    className: guessClass(value),
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy(guess && `${id}-guess`, error ? `${id}-error` : hint ? `${id}-hint` : null),
  };
  return (
    <div>
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {guess ? <GuessActions id={`${id}-guess`} label={label} onCheck={() => onChange(markChecked(value))} /> : null}
      </div>
      <div className="mt-1">
        {multiline ? (
          <AutoTextarea {...props} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <input {...props} className={`input ${props.className}`} onChange={(e) => onChange(e.target.value)} />
        )}
      </div>
      {error ? (
        <FieldError id={`${id}-error`}>{error}</FieldError>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function AddButton({ label, onClick, buttonRef }: { label: string; onClick: () => void; buttonRef: Ref<HTMLButtonElement> }) {
  return (
    <button ref={buttonRef} type="button" className="btn btn-sm" onClick={onClick}>
      <Plus size={14} aria-hidden />
      {label}
    </button>
  );
}

function ListField({
  kind,
  items,
  onChange,
  errors,
  placeholder,
  empty,
}: {
  kind: "offer" | "need";
  items: ListItem[];
  onChange: (items: ListItem[]) => void;
  errors: Record<string, string>;
  placeholder: string;
  empty: string;
}) {
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const noun = kind === "offer" ? "Offer" : "Need";

  const insert = (at: number) => {
    const item = { key: rowKey(), text: "" };
    onChange([...items.slice(0, at), item, ...items.slice(at)]);
    setFocusKey(item.key);
  };
  const update = (key: string, text: string) => onChange(items.map((item) => (item.key === key ? { ...item, text } : item)));
  const remove = (key: string) => {
    onChange(items.filter((item) => item.key !== key));
    addRef.current?.focus();
  };

  return (
    <div>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item, i) => {
            const id = `${kind}-${item.key}`;
            const label = `${noun} ${i + 1}`;
            const guess = isGuess(item.text);
            const error = errors[`${kind}:${item.key}`];
            return (
              <li key={item.key}>
                <label htmlFor={id} className="sr-only">
                  {label}
                </label>
                <div className="flex items-start gap-2">
                  <AutoTextarea
                    id={id}
                    value={stripGuess(item.text)}
                    placeholder={placeholder}
                    autoFocus={item.key === focusKey}
                    onChange={(e) => update(item.key, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        insert(i + 1);
                      }
                    }}
                    className={guessClass(item.text)}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={describedBy(guess && `${id}-guess`, error && `${id}-error`)}
                  />
                  <button type="button" className="btn btn-ghost btn-icon shrink-0" onClick={() => remove(item.key)} aria-label={`Remove ${label.toLowerCase()}`}>
                    <X size={16} aria-hidden />
                  </button>
                </div>
                {guess ? (
                  <div className="mt-1">
                    <GuessActions id={`${id}-guess`} label={label} onCheck={() => update(item.key, markChecked(item.text))} />
                  </div>
                ) : null}
                {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <AddButton label={`Add ${noun.toLowerCase()}`} onClick={() => insert(items.length)} buttonRef={addRef} />
        {items.some((item) => isBlank(item.text)) ? <span className="text-xs text-faint">Empty rows are left out.</span> : null}
      </div>
    </div>
  );
}

function RunInput({
  id,
  label,
  value,
  placeholder,
  error,
  autoFocus,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  error?: string;
  autoFocus?: boolean;
  onChange: (value: string) => void;
}) {
  const guess = isGuess(value);
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        className={`input ${guessClass(value)}`}
        value={stripGuess(value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(guess && `${id}-guess`, error && `${id}-error`)}
      />
      {guess ? (
        <div className="mt-1">
          <GuessActions id={`${id}-guess`} label={label} onCheck={() => onChange(markChecked(value))} />
        </div>
      ) : null}
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </div>
  );
}

function RunsField({ runs, onChange, errors }: { runs: RunItem[]; onChange: (runs: RunItem[]) => void; errors: Record<string, string> }) {
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const add = () => {
    const run = { key: rowKey(), event: "", frequency: "" };
    onChange([...runs, run]);
    setFocusKey(run.key);
  };
  const update = (key: string, patch: Partial<RunItem>) => onChange(runs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => {
    onChange(runs.filter((r) => r.key !== key));
    addRef.current?.focus();
  };
  const grid = "grid grid-cols-[minmax(0,1fr)_2.5rem] gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)_2.5rem]";

  return (
    <div>
      {runs.length === 0 ? (
        <p className="text-sm text-muted">No regular events yet. Add the meetups or sessions you run.</p>
      ) : (
        <>
          <div className={`${grid} mb-1.5 text-xs font-medium text-muted max-sm:hidden`} aria-hidden>
            <span>Event</span>
            <span>How often</span>
          </div>
          <ul className="space-y-3">
            {runs.map((run, i) => (
              <li key={run.key} className={grid}>
                <RunInput
                  id={`run-${run.key}-event`}
                  label={`Event ${i + 1}`}
                  value={run.event}
                  placeholder="Event, e.g. Monthly meetup"
                  error={errors[`run:${run.key}:event`]}
                  autoFocus={run.key === focusKey}
                  onChange={(event) => update(run.key, { event })}
                />
                <div className="col-start-1 min-w-0 sm:col-start-2 sm:row-start-1">
                  <RunInput
                    id={`run-${run.key}-frequency`}
                    label={`How often, event ${i + 1}`}
                    value={run.frequency}
                    placeholder="How often, e.g. Weekly"
                    error={errors[`run:${run.key}:frequency`]}
                    onChange={(frequency) => update(run.key, { frequency })}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon col-start-2 row-start-1 sm:col-start-3"
                  onClick={() => remove(run.key)}
                  aria-label={`Remove event ${i + 1}`}
                >
                  <X size={16} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-3">
        <AddButton label="Add event" onClick={add} buttonRef={addRef} />
      </div>
    </div>
  );
}

function DaysField({ days, onChange, error }: { days: Day[]; onChange: (days: Day[]) => void; error?: string }) {
  const legendId = useId();
  const toggle = (day: Day) => onChange(days.includes(day) ? days.filter((d) => d !== day) : DAYS.filter((d) => d === day || days.includes(d)));
  return (
    <fieldset aria-describedby={`${legendId}-hint`}>
      <legend className="text-sm font-medium">Days you can host or attend</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {DAYS.map((day) => (
          <button key={day} type="button" className="chip-btn min-w-12 justify-center" aria-pressed={days.includes(day)} onClick={() => toggle(day)}>
            <span aria-hidden>{day}</span>
            <span className="sr-only">{DAY_NAMES[day]}</span>
          </button>
        ))}
      </div>
      <p id={`${legendId}-hint`} className="mt-2 text-xs text-muted" aria-live="polite">
        {days.length ? `Bots will only suggest ${joinNames(days.map((d) => DAY_NAMES[d]))}.` : "None picked: no known day limits, so Bots may suggest any day."}
      </p>
      {error ? <FieldError id={`${legendId}-error`}>{error}</FieldError> : null}
    </fieldset>
  );
}

function GroupSizeField({ value, onChange, error }: { value: string; onChange: (value: string) => void; error?: string }) {
  return (
    <div>
      <label htmlFor="card-max-group" className="text-sm font-medium">
        Max group size
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          id="card-max-group"
          className="input w-32!"
          inputMode="numeric"
          autoComplete="off"
          placeholder="No limit"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "card-max-group-error" : "card-max-group-hint"}
        />
        <span className="text-sm text-muted">people</span>
      </div>
      {error ? (
        <FieldError id="card-max-group-error">{error}</FieldError>
      ) : (
        <p id="card-max-group-hint" className="mt-1.5 text-xs text-muted">
          Leave empty for no limit.
        </p>
      )}
    </div>
  );
}

function EditorSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className="card p-4 sm:p-6" aria-labelledby={id}>
      <h2 id={id} className="font-semibold leading-snug">
        {title}
      </h2>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      <div className="mt-4 space-y-5">{children}</div>
    </section>
  );
}

/** Every field of a card, editable. Two columns from lg. */
export function CardEditor({ editor, takenBy }: { editor: CardEditorState; takenBy?: { id: string; name: string } | null }) {
  const { draft, setDraft, errors, id, idFollowsName } = editor;
  const patch = (next: Partial<CardDraft>) => setDraft((d) => ({ ...d, ...next }));

  return (
    <div className="grid gap-4 sm:gap-6 lg:grid-cols-2 lg:items-start">
      <div className="space-y-4 sm:space-y-6">
        <EditorSection title="About" description="What partner Bots read first.">
          <TextField
            id="card-name"
            label="Name"
            value={draft.name}
            onChange={(name) => patch({ name })}
            error={errors.name}
            maxLength={120}
            required
            hint={
              <>
                {idFollowsName ? "Profile link: " : "Profile link stays "}
                <span className="font-mono text-ink">/c/{id}</span>
              </>
            }
          />
          {takenBy ? (
            <p className="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn" role="note">
              <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                <Link to={`/c/${takenBy.id}`} target="_blank" rel="noopener" className="font-medium underline underline-offset-2">
                  {takenBy.name}
                </Link>{" "}
                already uses this profile link. Confirming replaces its card.
              </span>
            </p>
          ) : null}
          <TextField id="card-tagline" label="Tagline" value={draft.tagline} onChange={(tagline) => patch({ tagline })} error={errors.tagline} placeholder="One line about what you do" multiline />
          <TextField id="card-location" label="Location" value={draft.location} onChange={(location) => patch({ location })} error={errors.location} placeholder="City or area" />
          <TextField id="card-members" label="Members" value={draft.members} onChange={(members) => patch({ members })} error={errors.members} placeholder="Who you are, and roughly how many" />
          <TextField
            id="card-tone"
            label="Tone"
            value={draft.tone}
            onChange={(tone) => patch({ tone })}
            error={errors.tone}
            placeholder="e.g. Warm and plain-spoken"
            hint="Your Bot writes in this tone."
          />
        </EditorSection>
        <EditorSection title="What you run" description="Regular events, so Bots suggest something that fits.">
          <RunsField runs={draft.runs} onChange={(runs) => patch({ runs })} errors={errors} />
        </EditorSection>
      </div>

      <div className="space-y-4 sm:space-y-6">
        <EditorSection title="Offers" description="What you can bring to a joint event.">
          <ListField kind="offer" items={draft.offers} onChange={(offers) => patch({ offers })} errors={errors} placeholder="e.g. A room for 40 people" empty="No offers yet." />
        </EditorSection>
        <EditorSection title="Needs" description="What you hope partners can bring.">
          <ListField kind="need" items={draft.needs} onChange={(needs) => patch({ needs })} errors={errors} placeholder="e.g. Speakers for a workshop" empty="No needs yet." />
        </EditorSection>
        <EditorSection title="Constraints" description="Bots plan joint events around these.">
          <DaysField days={draft.days} onChange={(days) => patch({ days })} error={errors.days} />
          <GroupSizeField value={draft.maxGroupSize} onChange={(maxGroupSize) => patch({ maxGroupSize })} error={errors.maxGroupSize} />
          <TextField id="card-notes" label="Notes" value={draft.notes} onChange={(notes) => patch({ notes })} error={errors.notes} placeholder="Anything else partners should know" multiline />
        </EditorSection>
        <EditorSection title="Sources" description="Where the Bot read about you. Not editable.">
          <SourceLinks urls={draft.sourceUrls} />
        </EditorSection>
      </div>
    </div>
  );
}

/** Explains the yellow highlight, with a live count of what is left. */
export function GuessLegend({ count }: { count: number }) {
  return (
    <p className="text-sm leading-relaxed">
      <span className="guess px-1 font-medium">Highlighted fields</span> are the Bot's guesses. Check them.{" "}
      <span className="text-muted" aria-live="polite">
        {count ? `${plural(count, "guess", "guesses")} left to check.` : "No guesses left."}
      </span>
    </p>
  );
}

/** Action bar that stays in view at the bottom while a long form scrolls. */
export function StickyBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-8 border-t border-line bg-bg/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:-mx-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">{children}</div>
    </div>
  );
}
