import { phoneTarget } from "./phone";
import { QrBlock } from "./ui";

export function PhoneLinks({ token, inboxToken }: { token: string; inboxToken: string }) {
  const approve = token ? phoneTarget("r", token) : null;
  const inbox = inboxToken ? phoneTarget("inbox", inboxToken) : null;
  const unset = Boolean((approve && approve.unset) || (inbox && inbox.unset));
  return (
    <div className="stack">
      {unset ? <p className="note">VITE_PHONE_BASE_URL is unset.</p> : null}
      {approve ? <QrBlock value={approve.text} caption="Approval link" /> : <p className="muted">No approval link yet.</p>}
      {inbox ? <QrBlock value={inbox.text} caption="Inbox link" /> : <p className="muted">No inbox link yet.</p>}
    </div>
  );
}
