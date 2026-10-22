import { DealSchema, buildIcs, formatZodError, slugify, type Card } from "@community-bots/core";
import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { getCommunities, getEvent, getJob, jobHeadline, rsvp, submitJob } from "../product/api";
import { DealCard } from "../product/DealCard";
import { errorMessage, isWrongPasscode } from "../product/errors";
import { PasscodeForm } from "../product/PasscodeForm";
import { PublishResult } from "../product/PublishResult";
import { usePasscode, useRegisterBackend } from "../product/session";
import { supabaseConfigured } from "../product/supabase";
import { useLiveQuery } from "../product/useLive";
import { eventPageUrl, isUuid } from "../product/url";
import { CopyButton, EmptyState, ErrorBanner, Loading, QrBlock, SampleStamp, SetupNotice, useTitle } from "../product/ui";

export default function EventPage() {
  const { dealId } = useParams();
  const [params] = useSearchParams();
  const organiser = params.get("organiser") === "1";
  const valid = isUuid(dealId);
  useTitle("Event");
  const { passcode, report } = usePasscode();
  const [name, setName] = useState("");
  const [rsvpNote, setRsvpNote] = useState<string | null>(null);
  const [rsvpError, setRsvpError] = useState<string | null>(null);
  const [rsvpBusy, setRsvpBusy] = useState(false);
  const [publishJobId, setPublishJobId] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const eventQuery = useLiveQuery({
    enabled: supabaseConfigured && valid,
    key: `event:${dealId ?? "none"}`,
    load: () => getEvent(dealId as string),
    watch: valid ? [{ table: "deals", filter: `id=eq.${dealId}` }] : [],
    pollMs: 2000,
  });
  const info = eventQuery.data;
  useRegisterBackend(info?.backend ?? null);

  const communityIds = info?.communities.map((community) => community.id) ?? [];
  const cardsQuery = useLiveQuery({
    enabled: supabaseConfigured && communityIds.length > 0,
    key: `event-cards:${communityIds.join(",")}`,
    load: () => getCommunities(communityIds),
  });
  const job = useLiveQuery({
    enabled: supabaseConfigured && Boolean(publishJobId),
    key: `publish:${publishJobId ?? "none"}`,
    load: () => getJob(publishJobId as string),
    watch: publishJobId ? [{ table: "jobs", filter: `id=eq.${publishJobId}` }] : [],
    pollMs: 2000,
  });

  const parsed = info ? DealSchema.safeParse(info.deal) : null;
  const cards = useMemo(() => {
    const map: Record<string, Card | undefined> = {};
    for (const community of cardsQuery.data ?? []) {
      if (community.card) map[community.id] = community.card;
    }
    return map;
  }, [cardsQuery.data]);
  const names = useMemo(() => {
    const map: Record<string, string> = {};
    for (const community of info?.communities ?? []) map[community.id] = community.name;
    return map;
  }, [info]);
  const pageUrl = valid ? eventPageUrl(dealId) : "";

  async function sendRsvp() {
    if (!valid) return;
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 60) {
      setRsvpError("Name must be between 1 and 60 characters");
      return;
    }
    setRsvpBusy(true);
    setRsvpError(null);
    try {
      await rsvp(dealId, trimmed);
      setName("");
      setRsvpNote("RSVP saved.");
      eventQuery.refresh();
    } catch (error) {
      setRsvpNote(null);
      setRsvpError(errorMessage(error));
    } finally {
      setRsvpBusy(false);
    }
  }

  async function publish() {
    if (!passcode || !valid) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const id = await submitJob(passcode, "publish_luma", { dealId });
      setPublishJobId(id);
    } catch (error) {
      const message = report(error);
      if (!isWrongPasscode(message)) setPublishError(message);
    } finally {
      setPublishing(false);
    }
  }

  function downloadIcs() {
    if (!parsed?.success || !valid) return;
    const body = buildIcs(parsed.data, { uid: dealId, url: pageUrl, confirmed: info?.allApproved === true });
    const blob = new Blob([body], { type: "text/calendar;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `${slugify(parsed.data.title) || "event"}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
  }

  const publishBusy = publishing || job.data?.status === "queued" || job.data?.status === "running";

  return (
    <div className="page stack-lg">
      {!valid ? <EmptyState title="This address is not an event id" /> : null}
      {valid && !supabaseConfigured ? <SetupNotice /> : null}
      {valid && supabaseConfigured && eventQuery.loading && !info ? <Loading label="Loading the event" /> : null}
      <ErrorBanner message={eventQuery.error} />
      {info ? (
        <>
          <header className="stack">
            <p className="kicker">Event</p>
            <h1>{info.allApproved ? "Confirmed" : "Draft"}</h1>
            {info.backend === "mock" ? <SampleStamp /> : null}
          </header>
          {parsed && !parsed.success ? (
            <div className="stack">
              <ErrorBanner message={formatZodError(parsed.error)} />
              <pre className="payload">{JSON.stringify(info.deal, null, 2)}</pre>
            </div>
          ) : null}
          {parsed?.success ? <DealCard deal={parsed.data} cards={cards} /> : null}
          <section className="stack">
            <h2>RSVP</h2>
            <p aria-live="polite">
              <strong>{info.rsvpCount}</strong> {info.rsvpCount === 1 ? "RSVP" : "RSVPs"}
            </p>
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                void sendRsvp();
              }}
            >
              <label className="block-label">
                Name
                <input className="field" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
              </label>
              <p className="hint">{name.trim().length} / 60</p>
              <ErrorBanner message={rsvpError} />
              {rsvpNote ? <p className="ok">{rsvpNote}</p> : null}
              <button className="btn-signal" type="submit" disabled={rsvpBusy}>
                RSVP
              </button>
            </form>
          </section>
          {parsed?.success ? (
            <div className="row">
              <button type="button" className="btn-quiet" onClick={downloadIcs}>
                Add to calendar
              </button>
              <CopyButton text={pageUrl} label="Share" />
            </div>
          ) : null}
          {pageUrl ? (
            <section className="stack">
              <h2>Page link</h2>
              <QrBlock value={pageUrl} caption="Event page" />
            </section>
          ) : null}
          <section className="stack">
            <h2>Announcements</h2>
            {info.announcements.length === 0 ? <p className="muted">No announcements yet.</p> : null}
            {info.announcements.map((announcement) => (
              <article key={announcement.communityId} className="stack">
                <h3>{names[announcement.communityId] || announcement.communityId}</h3>
                <p>{announcement.text}</p>
                <CopyButton text={announcement.text} label="Copy" />
              </article>
            ))}
          </section>
          {organiser ? (
            <section className="stack">
              <h2>Publish to Luma</h2>
              {!passcode ? <PasscodeForm reason="The passcode is required to queue a publish job." /> : null}
              <button type="button" className="btn-signal" disabled={!passcode || publishBusy} onClick={() => void publish()}>
                Publish to Luma
              </button>
              <ErrorBanner message={publishError || job.error} />
              {job.data ? (
                <p role="status">
                  <span className="kicker">Job {job.data.status}</span> {jobHeadline(job.data)}
                </p>
              ) : null}
              {job.data?.status === "error" ? <ErrorBanner message={job.data.error || "The job failed"} /> : null}
              {job.data?.status === "done" ? <PublishResult result={job.data.result} /> : null}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
