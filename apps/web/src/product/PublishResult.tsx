import { readPublishResult } from "./publish";
import { Payload, SafeLink } from "./ui";

export function PublishResult({ result }: { result: unknown }) {
  const view = readPublishResult(result);
  return (
    <div className="stack">
      <h3>{view.title}</h3>
      {view.published && view.url ? <SafeLink href={view.url} /> : null}
      {view.published ? null : <Payload text={view.body} />}
    </div>
  );
}
