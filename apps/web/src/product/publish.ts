export interface PublishView {
  /** True only when the job result itself says the event was published. */
  published: boolean;
  title: string;
  body: string;
  url?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Show an export payload when the result says it was not published. Never claim a publish otherwise. */
export function readPublishResult(result: unknown): PublishView {
  const raw = typeof result === "string" ? result : JSON.stringify(result, null, 2);
  const obj = asRecord(result);
  const hay = raw.toLowerCase();
  const saysNotPublished = hay.includes("not published") || obj?.published === false;
  const saysExport = hay.includes("export");
  const url = obj && typeof obj.url === "string" ? obj.url : undefined;

  if (saysNotPublished || (saysExport && obj?.published !== true)) {
    const payload = obj && "payload" in obj ? obj.payload : result;
    const payloadText = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
    const ics = obj && typeof obj.ics === "string" ? obj.ics : null;
    return {
      published: false,
      title: "Export, not published.",
      body: ics ? `${payloadText}\n\n${ics}` : payloadText,
    };
  }

  if (obj?.published === true && !hay.includes("not published")) {
    return {
      published: true,
      title: url ? "Published to Luma." : "The job says this was published.",
      body: raw,
      url,
    };
  }

  return {
    published: false,
    title: "The job finished. It does not say the event was published.",
    body: raw,
  };
}
