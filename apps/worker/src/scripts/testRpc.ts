import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "../db";
import { readableError } from "../errors";
import { loadEnv } from "../env";
import { loadSample } from "../sampleFixture";

loadEnv();

const url = process.env.VITE_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim() || "";
const anonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";
if (!url || !anonKey) {
  console.error("test:rpc needs VITE_SUPABASE_URL or SUPABASE_URL, and VITE_SUPABASE_ANON_KEY");
  process.exit(1);
}

const sample = loadSample();
const atlasToken = sample.approvalTokens["sample-atlas"];
const atlasInbox = sample.communities.find((entry) => entry.card.id === "sample-atlas")?.inboxToken;
const dealId = sample.deal.id;
const runId = sample.run.id;
if (!atlasToken || !atlasInbox) {
  console.error("sample fixture is missing the Atlas token or inbox");
  process.exit(1);
}

const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
let failed = 0;

function check(condition: boolean, label: string): void {
  if (condition) {
    console.log(`ok ${label}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}`);
}

function hasKey(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some((item) => hasKey(item, key));
  if (!value || typeof value !== "object") return false;
  for (const [childKey, child] of Object.entries(value)) {
    if (childKey === key || hasKey(child, key)) return true;
  }
  return false;
}

async function rpc(client: SupabaseClient, name: string, args?: Record<string, unknown>) {
  const result = await client.rpc(name, args);
  return result;
}

try {
  const request = await rpc(anon, "get_request", { p_token: atlasToken });
  check(!request.error, `get_request (${request.error ? readableError(new Error(request.error.message)) : "ok"})`);
  const body = request.data as Record<string, unknown> | null;
  check(Boolean(body && "status" in body && "community" in body && "deal" in body && "others" in body), "get_request returns status, community, deal, others");
  check(!hasKey(body?.community, "token") && !hasKey(body?.community, "inbox_token"), "get_request community has no token");
  check(!hasKey(body?.deal, "token") && !hasKey(body?.deal, "inbox_token"), "get_request deal has no token");
  check(!hasKey(body?.others, "token") && !hasKey(body?.others, "inbox_token"), "get_request others have no token");
  check(!hasKey(body, "inbox_token"), "get_request has no inbox_token");

  const listed = await rpc(anon, "list_requests", { p_inbox: atlasInbox });
  check(!listed.error && Array.isArray(listed.data), "list_requests returns an array");
  const first = Array.isArray(listed.data) ? (listed.data[0] as Record<string, unknown> | undefined) : undefined;
  check(
    Boolean(
      first &&
        ["token", "status", "round", "deal_id", "title", "date", "updated_at"].every((key) => key in first),
    ),
    "list_requests item has token, status, round, deal_id, title, date, updated_at",
  );

  const event = await rpc(anon, "get_event", { p_deal_id: dealId });
  check(!event.error, `get_event (${event.error ? readableError(new Error(event.error.message)) : "ok"})`);
  const eventBody = event.data as Record<string, unknown> | null;
  check(
    Boolean(
      eventBody &&
        ["deal", "backend", "communities", "announcements", "rsvp_count", "all_approved"].every((key) => key in eventBody),
    ),
    "get_event returns deal, backend, communities, announcements, rsvp_count, all_approved",
  );
  check(!hasKey(eventBody, "token") && !hasKey(eventBody, "note"), "get_event has no token or note");

  const communities = await anon.from("communities_public").select("id").limit(1);
  check(!communities.error && Array.isArray(communities.data), "communities_public select works");
  const runs = await anon.from("runs").select("id").limit(1);
  check(!runs.error && Array.isArray(runs.data), "runs select works");

  for (const table of ["approvals", "community_secrets", "settings", "rsvps", "luma_events"] as const) {
    const secret = await anon.from(table).select("*").limit(1);
    check(Boolean(secret.error), `anon cannot select ${table}`);
  }

  const wrongPresenter = await rpc(anon, "presenter_status", { p_passcode: "wrong-passcode", p_run_id: runId });
  check(Boolean(wrongPresenter.error && /wrong passcode/i.test(wrongPresenter.error.message)), "presenter_status wrong passcode");

  const presenter = await rpc(anon, "presenter_status", { p_passcode: "community", p_run_id: runId });
  check(!presenter.error && Array.isArray(presenter.data), "presenter_status community");
  const rows = Array.isArray(presenter.data) ? (presenter.data as { token?: string; inbox_token?: string }[]) : [];
  const tokens = new Set(rows.map((row) => row.token));
  const inboxes = new Set(rows.map((row) => row.inbox_token));
  check(rows.length === 3, "presenter_status returns three communities");
  check(
    sample.communities.every((entry) => tokens.has(sample.approvalTokens[entry.card.id]) && inboxes.has(entry.inboxToken)),
    "presenter_status returns the sample tokens and inbox tokens",
  );

  const wrongJob = await rpc(anon, "submit_job", { p_passcode: "wrong-passcode", p_type: "match", p_params: {} });
  check(Boolean(wrongJob.error), "submit_job wrong passcode");
  const badType = await rpc(anon, "submit_job", { p_passcode: "community", p_type: "not-a-type", p_params: {} });
  check(Boolean(badType.error), "submit_job unknown type");

  const nope = await rpc(anon, "respond", { p_token: atlasToken, p_decision: "nope" });
  check(Boolean(nope.error), "respond nope");
  const after = await rpc(anon, "get_request", { p_token: atlasToken });
  check(!after.error && (after.data as { status?: string } | null)?.status === "pending", "sample approval stays pending");

  const rsvp = await rpc(anon, "rsvp", { p_deal_id: dealId, p_name: "" });
  check(Boolean(rsvp.error), "rsvp empty name");

  const anonClaim = await rpc(anon, "claim_job");
  check(Boolean(anonClaim.error), "anon claim_job errors");

  const saveCard = await rpc(anon, "save_card", {
    p_passcode: "wrong-passcode",
    p_card: { id: "x", name: "x" },
    p_status: "draft",
  });
  check(Boolean(saveCard.error), "save_card wrong passcode");

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (serviceKey) {
    const service = createServiceClient(url, serviceKey);
    let probeId: string | null = null;
    const claimed: string[] = [];
    try {
      const inserted = await service
        .from("jobs")
        .insert({
          type: "match",
          params: { leadId: "sample-atlas", need: "claim_job probe, please ignore" },
          status: "queued",
        })
        .select("id")
        .single();
      check(!inserted.error && Boolean(inserted.data?.id), "insert probe match job");
      probeId = (inserted.data?.id as string | undefined) ?? null;
      if (probeId) {
        const first = await service.rpc("claim_job");
        const second = await service.rpc("claim_job");
        const firstId = (first.data as { id?: string } | null)?.id ?? null;
        const secondId = (second.data as { id?: string } | null)?.id ?? null;
        if (firstId) claimed.push(firstId);
        if (secondId) claimed.push(secondId);
        check(!first.error && firstId === probeId, "first claim_job returns the probe");
        check(!second.error && second.data == null, "second claim_job is null");
      }
    } finally {
      for (const id of claimed) {
        if (id !== probeId) {
          await service.from("jobs").update({ status: "queued", claimed_at: null }).eq("id", id);
        }
      }
      if (probeId) await service.from("jobs").delete().eq("id", probeId);
    }
  }
} catch (error) {
  console.error(readableError(error));
  process.exit(1);
}

if (failed) process.exit(1);
console.log("rpc checks passed");
