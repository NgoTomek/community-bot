import {
  buildIcs,
  CardSchema,
  DealSchema,
  formatZodError,
  JOB_PARAM_SCHEMAS,
  LIMITS,
  STOPPED_BY_ORGANISER,
  type NegotiateParams,
} from "@community-bots/core";
import type { Backend } from "@community-bots/core/backends";
import { draftCard, matchCommunities, runNegotiation } from "@community-bots/core/orchestrator";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import {
  insertApprovals,
  insertDeal,
  insertMessage,
  insertRun,
  listApprovals,
  loadCommunity,
  loadDeal,
  loadLuma,
  loadRun,
  listCommunities,
  markRunError,
  setProgress,
  updateRunWhere,
  upsertAnnouncements,
  upsertDraftCommunity,
  insertLumaIfAbsent,
} from "./db";
import { createRunControl } from "./runControl";
import { renegotiateRun } from "./renegotiate";
import { lumaPayload, publishToLuma, shouldPublishToLuma } from "./luma";
import { fetchPublicPages } from "./pages";
import { readableError } from "./errors";

export type ClaimedJob = { id: string; type: string; params: unknown };

function parse<T>(type: string, schema: z.ZodType<T>, params: unknown): T {
  const parsed = schema.safeParse(params);
  if (!parsed.success) throw new Error(`Invalid ${type} params: ${formatZodError(parsed.error)}`);
  return parsed.data;
}

function field(params: unknown, key: string): unknown {
  if (!params || typeof params !== "object") return undefined;
  return (params as Record<string, unknown>)[key];
}

export async function draftCommunity(opts: {
  client: SupabaseClient;
  backend: Backend;
  url: string;
  name?: string;
  /** When false, public pages are not fetched. Seed uses that so it never scrapes. */
  scrape: boolean;
  onProgress?: (text: string) => Promise<void>;
}) {
  if (opts.url.length > LIMITS.url) throw new Error(`URL must be at most ${LIMITS.url} characters`);
  await opts.onProgress?.("Reading the public page");
  const pages = opts.scrape && !opts.backend.canBrowse ? await fetchPublicPages(opts.url) : undefined;
  await opts.onProgress?.("Writing the card");
  const card = CardSchema.parse(
    await draftCard({
      backend: opts.backend,
      url: opts.url,
      nameHint: opts.name,
      pages,
      onProgress: opts.onProgress,
    }),
  );
  return upsertDraftCommunity(opts.client, card);
}

async function setTyping(client: SupabaseClient, runId: string, typing: string | null): Promise<void> {
  const { error } = await client.from("runs").update({ typing }).eq("id", runId);
  if (error) console.error(`typing: ${readableError(new Error(error.message))}`);
}

export function createHandlers(opts: { client: SupabaseClient; backend: Backend }) {
  const { client, backend } = opts;

  async function handleJob(job: ClaimedJob): Promise<unknown> {
    switch (job.type) {
      case "draft_card":
        return handleDraft(job);
      case "match":
        return handleMatch(job);
      case "negotiate":
        return handleNegotiate(job);
      case "renegotiate":
        return handleRenegotiate(job);
      case "publish_luma":
        return handlePublish(job);
      default:
        throw new Error(`Unknown job type "${job.type}"`);
    }
  }

  async function handleDraft(job: ClaimedJob) {
    const url = field(job.params, "url");
    if (typeof url === "string" && url.length > LIMITS.url) {
      throw new Error(`URL must be at most ${LIMITS.url} characters`);
    }
    const params = parse("draft_card", JOB_PARAM_SCHEMAS.draft_card, job.params);
    const card = await draftCommunity({
      client,
      backend,
      url: params.url,
      name: params.name,
      scrape: true,
      onProgress: (text) => setProgress(client, job.id, text),
    });
    return { backend: backend.name, card };
  }

  async function handleMatch(job: ClaimedJob) {
    const need = field(job.params, "need");
    if (typeof need === "string") {
      const length = need.trim().length;
      if (length < 5 || length > LIMITS.need) {
        throw new Error(`Need must be between 5 and ${LIMITS.need} characters`);
      }
    }
    const params = parse("match", JOB_PARAM_SCHEMAS.match, job.params);
    await setProgress(client, job.id, "Matching communities");
    const all = await listCommunities(client);
    const lead = all.find((community) => community.id === params.leadId) ?? (await loadCommunity(client, params.leadId));
    if (!lead) throw new Error(`Community ${params.leadId} was not found`);
    const candidates = await matchCommunities({
      backend,
      lead: { card: lead.card, status: lead.status },
      need: params.need,
      candidates: all
        .filter((community) => community.id !== params.leadId)
        .map((community) => ({ card: community.card, status: community.status })),
    });
    return { backend: backend.name, leadId: params.leadId, need: params.need, candidates };
  }

  async function handleNegotiate(job: ClaimedJob) {
    const need = field(job.params, "need");
    if (typeof need === "string") {
      const length = need.trim().length;
      if (length < 5 || length > LIMITS.need) {
        throw new Error(`Need must be between 5 and ${LIMITS.need} characters`);
      }
    }
    const params = parse("negotiate", JOB_PARAM_SCHEMAS.negotiate, job.params);
    if (params.partnerIds.includes(params.leadId)) throw new Error("The lead community cannot also be a partner");
    if (new Set(params.partnerIds).size !== params.partnerIds.length) {
      throw new Error("Partner communities must be unique");
    }
    const lead = await loadCommunity(client, params.leadId);
    if (!lead) throw new Error(`Lead community ${params.leadId} was not found`);
    const partners = [];
    for (const id of params.partnerIds) {
      const partner = await loadCommunity(client, id);
      if (!partner) throw new Error(`Partner community ${id} was not found`);
      partners.push(partner);
    }

    await setProgress(client, job.id, "Negotiating");
    const run = await insertRun(client, {
      id: params.runId,
      lead_id: params.leadId,
      need: params.need,
      partner_ids: params.partnerIds,
      backend: backend.name,
      round: 1,
    });
    try {
      return await negotiate(job.id, run.id, params, lead, partners);
    } catch (error) {
      await markRunError(client, run.id, readableError(error));
      throw error;
    }
  }

  async function negotiate(
    jobId: string,
    runId: string,
    params: NegotiateParams,
    lead: NonNullable<Awaited<ReturnType<typeof loadCommunity>>>,
    partners: NonNullable<Awaited<ReturnType<typeof loadCommunity>>>[],
  ) {
    const control = createRunControl(client, runId);
    const outcome = await runNegotiation({
      backend,
      runId,
      need: params.need,
      lead: { card: lead.card, status: lead.status },
      partners: partners.map((partner) => ({ card: partner.card, status: partner.status })),
      control,
      onMessage: async (message) => {
        const id = await insertMessage(client, runId, message);
        if (message.role === "human") control.ignore(id);
      },
      onTyping: (communityId) => setTyping(client, runId, communityId),
      onPhase: async (phase) => {
        await setProgress(client, jobId, phase === "compiling" ? "Writing the deal" : "Negotiating");
        await updateRunWhere(client, runId, { status: phase, typing: null }, ["negotiating", "compiling"]);
      },
    });

    if (outcome.stopped) {
      await updateRunWhere(
        client,
        runId,
        { status: "declined", decline_reason: STOPPED_BY_ORGANISER, typing: null },
        ["negotiating", "compiling", "pending_approval"],
      );
      return { backend: backend.name, runId, dealId: null, consensus: false };
    }
    if (!outcome.deal) {
      throw new Error("No partner agreed to a deal.");
    }

    const dealId = await insertDeal(client, { runId, deal: outcome.deal, round: 1 });
    await upsertAnnouncements(client, dealId, outcome.announcements);
    await insertApprovals(
      client,
      runId,
      dealId,
      outcome.deal.communities.map((community) => community.id),
      1,
    );
    const saved = await updateRunWhere(
      client,
      runId,
      { status: "pending_approval", consensus: outcome.consensus, deal_id: dealId, typing: null, error: null },
      ["negotiating", "compiling"],
    );
    if (!saved) {
      const current = await loadRun(client, runId);
      if (current?.status === "declined") return { backend: backend.name, runId, dealId: null, consensus: false };
      throw new Error("Could not move the run to approval");
    }
    return { backend: backend.name, runId, dealId, consensus: outcome.consensus };
  }

  async function handleRenegotiate(job: ClaimedJob) {
    const params = parse("renegotiate", JOB_PARAM_SCHEMAS.renegotiate, job.params);
    const outcome = await renegotiateRun({
      client,
      backend,
      runId: params.runId,
      allowInProgress: true,
      onProgress: (text) => setProgress(client, job.id, text),
    });
    if (outcome.kind === "skipped") return { backend: backend.name, runId: params.runId, skipped: true };
    if (outcome.kind === "stopped") {
      return { backend: backend.name, runId: params.runId, dealId: null, consensus: false, stopped: true };
    }
    return {
      backend: backend.name,
      runId: params.runId,
      dealId: outcome.dealId,
      round: outcome.round,
      consensus: outcome.consensus,
    };
  }

  async function handlePublish(job: ClaimedJob) {
    const params = parse("publish_luma", JOB_PARAM_SCHEMAS.publish_luma, job.params);
    await setProgress(client, job.id, "Preparing the export");
    const row = await loadDeal(client, params.dealId);
    if (!row) throw new Error("Deal not found");
    const parsed = DealSchema.safeParse(row.deal);
    if (!parsed.success) throw new Error(`This deal cannot be exported: ${formatZodError(parsed.error)}`);
    const approvals = await listApprovals(client, row.run_id);
    if (approvals.length === 0 || approvals.some((approval) => approval.status !== "approved")) {
      throw new Error("Not everyone has approved yet");
    }
    const payload = lumaPayload(parsed.data);
    const ics = buildIcs(parsed.data, { uid: params.dealId, confirmed: true });
    const existing = await loadLuma(client, params.dealId);
    if (existing?.luma_event_id) {
      return {
        published: true,
        deal_id: existing.deal_id,
        luma_event_id: existing.luma_event_id,
        url: existing.url,
        payload,
        ics,
      };
    }
    const apiKey = process.env.LUMA_API_KEY?.trim() ?? "";
    if (apiKey && shouldPublishToLuma()) await publishToLuma(apiKey, payload);
    if (!existing) await insertLumaIfAbsent(client, params.dealId);
    return { published: false, label: "export, not published" as const, payload, ics };
  }

  return { handleJob };
}
