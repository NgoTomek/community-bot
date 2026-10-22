import {
  CardSchema,
  DAYS,
  GUESS_PREFIX,
  formatZodError,
  isGuess,
  type Card,
  type Day,
} from "@community-bots/core";
import { useState, type FormEvent } from "react";
import { ErrorBanner, SafeLink } from "./ui";

interface Loose {
  id: string;
  name: string;
  tagline: string | null;
  location: string | null;
  members: string | null;
  runs: { event: string; frequency: string | null }[];
  offers: string[];
  needs: string[];
  constraints: { days: Day[]; maxGroupSize: number | null; notes: string | null };
  tone: string | null;
  sourceUrls: string[];
}

function cardToLoose(card: Card): Loose {
  return {
    ...card,
    runs: card.runs.map((run) => ({ ...run })),
    offers: [...card.offers],
    needs: [...card.needs],
    sourceUrls: [...card.sourceUrls],
    constraints: { ...card.constraints, days: [...card.constraints.days] },
  };
}

function isDay(value: unknown): value is Day {
  return typeof value === "string" && (DAYS as readonly string[]).includes(value);
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function toLoose(value: unknown): Loose | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const constraints =
    row.constraints && typeof row.constraints === "object" && !Array.isArray(row.constraints)
      ? (row.constraints as Record<string, unknown>)
      : {};
  const max = constraints.maxGroupSize;
  return {
    id: typeof row.id === "string" ? row.id : "",
    name: typeof row.name === "string" ? row.name : "",
    tagline: typeof row.tagline === "string" ? row.tagline : null,
    location: typeof row.location === "string" ? row.location : null,
    members: typeof row.members === "string" ? row.members : null,
    runs: Array.isArray(row.runs)
      ? row.runs.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const run = item as Record<string, unknown>;
          return [{ event: typeof run.event === "string" ? run.event : "", frequency: typeof run.frequency === "string" ? run.frequency : null }];
        })
      : [],
    offers: strings(row.offers),
    needs: strings(row.needs),
    constraints: {
      days: Array.isArray(constraints.days) ? constraints.days.filter(isDay) : [],
      maxGroupSize: typeof max === "number" && Number.isFinite(max) ? max : null,
      notes: typeof constraints.notes === "string" ? constraints.notes : null,
    },
    tone: typeof row.tone === "string" ? row.tone : null,
    sourceUrls: strings(row.sourceUrls),
  };
}

function parsedCard(text: string): { card: Card | null; message: string | null } {
  try {
    const parsed = CardSchema.safeParse(JSON.parse(text) as unknown);
    if (!parsed.success) return { card: null, message: formatZodError(parsed.error) };
    return { card: parsed.data, message: null };
  } catch {
    return { card: null, message: "JSON is not valid" };
  }
}

function TextField({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  multiline?: boolean;
}) {
  const text = value ?? "";
  const guess = isGuess(text);
  const className = guess ? "field guess" : "field";
  return (
    <label className="block-label">
      {label}
      {multiline ? (
        <textarea className={className} value={text} onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)} />
      ) : (
        <input className={className} value={text} onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)} />
      )}
      {guess ? (
        <button type="button" className="btn-quiet" onClick={() => onChange(text.slice(GUESS_PREFIX.length) || null)}>
          Drop the GUESS prefix
        </button>
      ) : null}
    </label>
  );
}

function StringList({ label, values, onChange }: { label: string; values: string[]; onChange: (values: string[]) => void }) {
  return (
    <fieldset className="stack">
      <legend>{label}</legend>
      {values.map((value, index) => (
        <div key={index} className="row">
          <input
            className={isGuess(value) ? "field guess" : "field"}
            value={value}
            aria-label={`${label} ${index + 1}`}
            onChange={(event) => onChange(values.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))}
          />
          <button type="button" className="btn-quiet" onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="btn-quiet" onClick={() => onChange([...values, ""])}>
        Add
      </button>
    </fieldset>
  );
}

export function CardEditor({
  initial,
  disabled = false,
  busy = false,
  serverError,
  onConfirm,
}: {
  initial: Card;
  disabled?: boolean;
  busy?: boolean;
  serverError?: string | null;
  onConfirm: (card: Card) => void;
}) {
  const [draft, setDraft] = useState<Loose>(() => cardToLoose(initial));
  const [jsonText, setJsonText] = useState(() => JSON.stringify(initial, null, 2));
  const check = parsedCard(jsonText);
  const locked = check.message === "JSON is not valid";

  function commit(next: Loose) {
    if (locked) return;
    setDraft(next);
    setJsonText(JSON.stringify(next, null, 2));
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (disabled || !check.card) return;
    onConfirm(check.card);
  }

  return (
    <form className="stack-lg" onSubmit={onSubmit}>
      <p className="hint">Amber fields start with GUESS:. They were inferred. Confirm stores this card only when the JSON parses.</p>
      <ErrorBanner message={serverError} />
      <div className="split">
        <div className="stack">
          <label className="block-label">
            Id
            <input className="field" value={draft.id} disabled={locked} spellCheck={false} onChange={(event) => commit({ ...draft, id: event.target.value.trim() })} />
          </label>
          <p className="hint">Kebab-case. This is the address /c/{draft.id || "…"}.</p>
          <label className="block-label">
            Name
            <input className={isGuess(draft.name) ? "field guess" : "field"} value={draft.name} disabled={locked} onChange={(event) => commit({ ...draft, name: event.target.value })} />
          </label>
          <TextField label="Tagline" value={draft.tagline} onChange={(tagline) => commit({ ...draft, tagline })} />
          <TextField label="Location" value={draft.location} onChange={(location) => commit({ ...draft, location })} />
          <TextField label="Members" value={draft.members} onChange={(members) => commit({ ...draft, members })} />
          <TextField label="Tone" value={draft.tone} onChange={(tone) => commit({ ...draft, tone })} />
          <fieldset className="stack">
            <legend>Runs</legend>
            {draft.runs.map((run, index) => (
              <div key={index} className="stack">
                <input
                  className={isGuess(run.event) ? "field guess" : "field"}
                  value={run.event}
                  aria-label={`Run ${index + 1}`}
                  disabled={locked}
                  onChange={(event) =>
                    commit({
                      ...draft,
                      runs: draft.runs.map((item, itemIndex) => (itemIndex === index ? { ...item, event: event.target.value } : item)),
                    })
                  }
                />
                <input
                  className={isGuess(run.frequency) ? "field guess" : "field"}
                  value={run.frequency ?? ""}
                  aria-label={`Frequency ${index + 1}`}
                  placeholder="Frequency"
                  disabled={locked}
                  onChange={(event) =>
                    commit({
                      ...draft,
                      runs: draft.runs.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, frequency: event.target.value === "" ? null : event.target.value } : item,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  className="btn-quiet"
                  onClick={() => commit({ ...draft, runs: draft.runs.filter((_, itemIndex) => itemIndex !== index) })}
                >
                  Remove
                </button>
              </div>
            ))}
            <button type="button" className="btn-quiet" onClick={() => commit({ ...draft, runs: [...draft.runs, { event: "", frequency: null }] })}>
              Add a run
            </button>
          </fieldset>
          <StringList label="Offers" values={draft.offers} onChange={(offers) => commit({ ...draft, offers })} />
          <StringList label="Needs" values={draft.needs} onChange={(needs) => commit({ ...draft, needs })} />
          <fieldset className="stack">
            <legend>Days</legend>
            <div className="row">
              {DAYS.map((day) => (
                <label key={day} className="choice">
                  <input
                    type="checkbox"
                    checked={draft.constraints.days.includes(day)}
                    disabled={locked}
                    onChange={() => {
                      const has = draft.constraints.days.includes(day);
                      const days = DAYS.filter((item) => (item === day ? !has : draft.constraints.days.includes(item)));
                      commit({ ...draft, constraints: { ...draft.constraints, days } });
                    }}
                  />
                  {day}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block-label">
            Max group size
            <input
              className="field"
              inputMode="numeric"
              value={draft.constraints.maxGroupSize ?? ""}
              disabled={locked}
              onChange={(event) => {
                const text = event.target.value;
                if (text === "") {
                  commit({ ...draft, constraints: { ...draft.constraints, maxGroupSize: null } });
                  return;
                }
                if (!/^\d{1,6}$/.test(text)) return;
                commit({ ...draft, constraints: { ...draft.constraints, maxGroupSize: Number(text) } });
              }}
            />
          </label>
          <TextField
            label="Constraint notes"
            value={draft.constraints.notes}
            multiline
            onChange={(notes) => commit({ ...draft, constraints: { ...draft.constraints, notes } })}
          />
          <section className="stack">
            <h3>Sources</h3>
            {draft.sourceUrls.filter((url) => url.trim()).length === 0 ? (
              <p className="muted">No source links yet.</p>
            ) : (
              <ul>
                {draft.sourceUrls.map((url, index) =>
                  url.trim() ? (
                    <li key={`${url}-${index}`}>
                      <SafeLink href={url} />
                    </li>
                  ) : null,
                )}
              </ul>
            )}
          </section>
          <StringList label="Source URLs" values={draft.sourceUrls} onChange={(sourceUrls) => commit({ ...draft, sourceUrls })} />
        </div>
        <div className="stack">
          <label className="block-label">
            Card JSON
            <textarea
              className="field json"
              value={jsonText}
              spellCheck={false}
              aria-invalid={check.message ? true : undefined}
              onChange={(event) => {
                const text = event.target.value;
                setJsonText(text);
                try {
                  const loose = toLoose(JSON.parse(text) as unknown);
                  if (loose) setDraft(loose);
                } catch {
                  /* keep the last draft until the JSON parses */
                }
              }}
              onBlur={() => {
                if (!check.card) return;
                setDraft(cardToLoose(check.card));
                setJsonText(JSON.stringify(check.card, null, 2));
              }}
            />
          </label>
          {check.message ? <p className="bad">{check.message}</p> : <p className="ok">JSON is a valid card.</p>}
          {locked ? (
            <button type="button" className="btn-quiet" onClick={() => setJsonText(JSON.stringify(draft, null, 2))}>
              Restore the last card JSON
            </button>
          ) : null}
        </div>
      </div>
      <button className="btn-signal" type="submit" disabled={disabled || busy || !check.card}>
        {busy ? "Saving" : "Confirm"}
      </button>
    </form>
  );
}
