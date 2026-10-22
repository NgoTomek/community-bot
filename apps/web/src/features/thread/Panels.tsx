import { AnimatePresence, motion } from "framer-motion";
import { BadgeCheck, CircleX, MessageSquarePlus, Pause, Play, RefreshCw, Share2, Square, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { usePresenter } from "../../app/presenter";
import { Avatar } from "../../components/Avatar";
import { ApprovalPill, YouTag } from "../../components/Badges";
import { CopyButton } from "../../components/CopyButton";
import { Qr } from "../../components/Qr";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { useToast } from "../../components/ui/Toast";
import { Tooltip, useGate } from "../../components/ui/Tooltip";
import { useData } from "../../data/DataProvider";
import { errorText } from "../../data/hooks";
import type { ApprovalView, DealVersion, Run } from "../../data/types";
import { copyText, phoneLink, shareUpdateText, appUrl } from "../../lib/share";

export function isActive(run: Run) {
  return run.control !== "stopped" && (run.status === "negotiating" || run.status === "compiling" || run.status === "pending_approval" || run.status === "matching");
}

/** Who has approved, who is pending, who asked for changes, with their notes. */
export function StatusList({
  ids,
  names,
  approvals,
  visible,
  myCommunityId,
}: {
  ids: string[];
  names: Record<string, string>;
  approvals: ApprovalView[];
  visible: boolean;
  myCommunityId: string | null;
}) {
  const byId = new Map(approvals.map((a) => [a.communityId, a]));
  return (
    <section className="card p-5" aria-label="Organiser decisions">
      <h2 className="eyebrow mb-4">Organisers</h2>
      <ul className="space-y-3" aria-live="polite">
        {ids.map((id) => {
          const approval = byId.get(id);
          return (
            <li key={id} className="flex items-start gap-3">
              <Avatar id={id} name={names[id] ?? id} size={28} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{names[id] ?? id}</span>
                  {id === myCommunityId ? <YouTag /> : null}
                  <span className="ml-auto">
                    <motion.span key={approval?.status ?? "unknown"} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.18 }} className="inline-flex">
                      {approval ? <ApprovalPill status={approval.status} /> : <span className="pill border-line text-faint">{visible ? "Not asked yet" : "Private"}</span>}
                    </motion.span>
                  </span>
                </div>
                {approval?.note ? <p className="mt-1 text-sm text-muted">“{approval.note}”</p> : null}
              </div>
            </li>
          );
        })}
      </ul>
      {!visible ? (
        <p className="mt-4 text-xs text-faint">Decisions are visible to the organisers in this collab. Open your organiser link, or use presenter mode.</p>
      ) : null}
    </section>
  );
}

/** Pause, resume, stop, steer and the share update. Hidden in projector view. */
export function RunControls({
  run,
  deal,
  approvals,
  names,
  onSteer,
}: {
  run: Run;
  deal: DealVersion | undefined;
  approvals: ApprovalView[];
  names: Record<string, string>;
  onSteer: () => void;
}) {
  const source = useData();
  const toast = useToast();
  const { ensurePasscode, isPresenter } = usePresenter();
  const control = useGate("set_run_control");
  const jobs = useGate("submit_job");
  const [confirmStop, setConfirmStop] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = isActive(run);

  const act = async (action: "pause" | "resume" | "stop") => {
    const passcode = await ensurePasscode("Pausing or stopping the Bots needs the organiser passcode.");
    if (passcode === false) return;
    setBusy(true);
    try {
      await source.setRunControl(passcode, run.id, action);
      toast({ title: action === "pause" ? "Paused. The Bots wait for you." : action === "resume" ? "Resumed" : "Stopped. Nothing was agreed.", tone: action === "stop" ? "info" : "ok" });
    } catch (err) {
      toast({ title: "That did not work", body: errorText(err), tone: "bad" });
    } finally {
      setBusy(false);
      setConfirmStop(false);
    }
  };

  const asked = approvals.filter((a) => a.status === "renegotiate" && (a.round ?? run.round) === run.round);
  const startNextRound = async () => {
    const passcode = await ensurePasscode("Starting a new round needs the organiser passcode.");
    if (passcode === false) return;
    setBusy(true);
    try {
      await source.submitJob(passcode, "renegotiate", { runId: run.id, dealId: run.dealId, notes: asked.map((a) => ({ communityId: a.communityId, note: a.note })) });
      toast({ title: `Round ${run.round + 1} is starting`, tone: "ok" });
    } catch (err) {
      toast({ title: "Could not start the next round", body: errorText(err), tone: "bad" });
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    const text = shareUpdateText({ run, deal: deal?.deal ?? null, approvals, link: appUrl(`/run/${run.id}`) });
    if (await copyText(text)) toast({ title: "Update copied", body: "Paste it into WhatsApp or Slack.", tone: "ok" });
  };

  const paused = run.control === "paused";
  return (
    <section className="card admin-only p-5" aria-label="Run controls">
      <h2 className="eyebrow mb-4">Controls</h2>
      <div className="flex flex-wrap gap-2">
        <Tooltip label={control.reason ?? (!active ? "This collab has finished" : null)}>
          <button type="button" className="btn btn-sm" disabled={!active || busy || control.disabled} onClick={() => void act(paused ? "resume" : "pause")}>
            {paused ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />}
            {paused ? "Resume" : "Pause"}
          </button>
        </Tooltip>
        <Tooltip label={control.reason ?? (!active ? "This collab has finished" : null)}>
          <button type="button" className="btn btn-sm btn-danger" disabled={!active || busy || control.disabled} onClick={() => setConfirmStop(true)}>
            <Square size={14} aria-hidden /> Stop
          </button>
        </Tooltip>
        <button type="button" className="btn btn-sm" onClick={onSteer} disabled={!active}>
          <MessageSquarePlus size={14} aria-hidden /> Steer
        </button>
        <button type="button" className="btn btn-sm" onClick={() => void share()}>
          <Share2 size={14} aria-hidden /> Share update
        </button>
      </div>
      {isPresenter && asked.length && run.status === "pending_approval" ? (
        <div className="mt-4 rounded-lg bg-warn-soft p-3 text-sm">
          <p>
            {asked.map((a) => names[a.communityId] ?? a.name).join(", ")} asked to renegotiate. Start round {run.round + 1} when you are ready.
          </p>
          <Tooltip label={jobs.reason}>
            <button type="button" className="btn btn-sm mt-2" disabled={busy || jobs.disabled} onClick={() => void startNextRound()}>
              <RefreshCw size={14} aria-hidden /> Start round {run.round + 1}
            </button>
          </Tooltip>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmStop}
        onClose={() => setConfirmStop(false)}
        onConfirm={() => void act("stop")}
        title="Stop this collab?"
        body="The Bots stop negotiating and nothing is agreed. Everyone in the collab will see that it was stopped."
        confirmLabel="Stop the collab"
        destructive
        busy={busy}
      />
    </section>
  );
}

/** Presenter mode: each organiser's phone link, as a QR code and a copy button. */
export function PresenterLinks({ approvals, names }: { approvals: ApprovalView[]; names: Record<string, string> }) {
  const withTokens = approvals.filter((a) => a.token);
  if (!withTokens.length) return null;
  return (
    <section className="card admin-only p-5" aria-label="Phone links">
      <h2 className="eyebrow">Phone links</h2>
      <p className="mt-1 text-sm text-muted">Each organiser scans their code to approve on their phone.</p>
      <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {withTokens.map((a) => {
          const link = phoneLink(a.token!);
          return (
            <li key={a.communityId} className="flex flex-col items-center gap-2 rounded-lg border border-line p-3 text-center">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Avatar id={a.communityId} name={names[a.communityId] ?? a.name} size={20} />
                {names[a.communityId] ?? a.name}
              </p>
              <Qr value={link} size={104} />
              <ApprovalPill status={a.status} />
              <CopyButton text={link} label="Copy link" className="btn btn-sm w-full" />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Confirmed / declined / stopped / failed / paused banner above the thread. */
export function RunBanner({ run, approvals, names }: { run: Run; approvals: ApprovalView[]; names: Record<string, string> }) {
  let content: { tone: string; icon: typeof BadgeCheck; title: string; body: string; action?: { label: string; to: string } } | null = null;
  if (run.status === "confirmed") {
    content = {
      tone: "border-ok/30 bg-ok-soft",
      icon: BadgeCheck,
      title: "Confirmed",
      body: run.round > 1 ? `Every organiser approved round ${run.round}.` : "Every organiser approved the deal.",
      action: run.dealId ? { label: "Open the event page", to: `/event/${run.dealId}` } : undefined,
    };
  } else if (run.status === "declined") {
    const by = approvals.find((a) => a.status === "declined");
    content = {
      tone: "border-bad/30 bg-bad-soft",
      icon: CircleX,
      title: by ? `Declined by ${names[by.communityId] ?? by.name}` : "Declined",
      body: run.declineReason ?? by?.note ?? "One of the organisers said no. Nothing was agreed.",
    };
  } else if (run.control === "stopped") {
    content = { tone: "border-line bg-sunken", icon: Square, title: "Stopped", body: "An organiser stopped this collab. Nothing was agreed." };
  } else if (run.status === "error") {
    content = { tone: "border-bad/30 bg-bad-soft", icon: TriangleAlert, title: "The run failed", body: run.error ?? "Something went wrong while the Bots were working." };
  } else if (run.control === "paused") {
    content = { tone: "border-warn/30 bg-warn-soft", icon: Pause, title: "Paused", body: "The Bots wait until an organiser resumes the run." };
  }
  return (
    <AnimatePresence initial={false}>
      {content ? (
        <motion.div
          key={content.title}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className={`card mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${content.tone}`}
          role="status"
        >
          <content.icon size={22} className="shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{content.title}</p>
            <p className="text-sm text-muted">{content.body}</p>
          </div>
          {content.action ? (
            <Link to={content.action.to} className="btn btn-ok shrink-0">
              {content.action.label}
            </Link>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
