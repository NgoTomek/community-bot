import { Share2 } from "lucide-react";
import { useId } from "react";
import { CopyButton } from "../../components/CopyButton";
import { Qr } from "../../components/Qr";

/** Copy link, the system share sheet when the browser has one, and a QR code (large on the projector). */
export function ShareCard({ url, title, text, present }: { url: string; title: string; text: string; present: boolean }) {
  const id = useId();
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const share = async () => {
    try {
      await navigator.share({ title, text, url });
    } catch {
      /* the person closed the share sheet */
    }
  };
  return (
    <section className="card p-5 sm:p-6" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="eyebrow">
        {present ? "Scan to RSVP" : "Share this event"}
      </h2>
      <div className={`mt-4 flex gap-5 ${present ? "flex-col items-center" : "items-center"}`}>
        <Qr value={url} size={present ? 280 : 116} label={present ? undefined : "Scan to open on a phone"} />
        <div className="present-hide flex min-w-0 flex-1 flex-col gap-2 print:hidden">
          <p className="text-sm text-muted">Send it to your community, or put the QR code on a slide.</p>
          <CopyButton text={url} label="Copy link" copiedLabel="Link copied" className="btn btn-sm w-full" />
          {canShare ? (
            <button type="button" className="btn btn-sm w-full" onClick={() => void share()}>
              <Share2 size={14} aria-hidden />
              Share…
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
