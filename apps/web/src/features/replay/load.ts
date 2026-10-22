import { MockSource } from "../../data/mock/mockSource";
import type { DataSource } from "../../data/types";
import { parseExportedRun, replayFromExported } from "./exported";
import { replayFromSource, type ReplayBundle, type ReplayData } from "./model";

type Fetcher = (url: string, init?: RequestInit) => Promise<Pick<Response, "ok" | "json">>;

async function orNull<T>(load: () => Promise<T | null>): Promise<T | null> {
  try {
    return await load();
  } catch {
    return null;
  }
}

/** /replay/:runId: everything comes from the data source. Null when the run does not exist. */
export async function loadRunReplay(source: DataSource, runId: string): Promise<ReplayBundle | null> {
  const run = await source.getRun(runId);
  if (!run) return null;
  const [messages, deals, communities] = await Promise.all([source.listMessages(runId), source.listDeals(runId), source.listCommunities()]);
  const data = replayFromSource({ origin: "source", run, messages, deals, communities });
  const latest = data.deals[data.deals.length - 1];
  return { data, threadRunId: run.id, eventDealId: latest ? (run.dealId ?? latest.id) : null };
}

/** The bundled recording, or null when it is missing or not a replayable ExportedRun. */
export async function loadExportedFile(url: string, fetcher: Fetcher): Promise<ReplayData | null> {
  return orNull(async () => {
    const response = await fetcher(url, { cache: "no-cache" });
    if (!response.ok) return null;
    const exported = parseExportedRun(await response.json());
    return exported ? replayFromExported(exported, "file") : null;
  });
}

/** The confirmed run of a fresh sample world. Its timers are stopped before returning. */
export async function loadSampleRun(): Promise<ReplayData | null> {
  const mock = new MockSource({ storage: null });
  try {
    const run = (await mock.listRuns()).find((r) => r.status === "confirmed");
    if (!run) return null;
    const [messages, deals, communities] = await Promise.all([mock.listMessages(run.id), mock.listDeals(run.id), mock.listCommunities()]);
    return replayFromSource({ origin: "sample", run, messages, deals, communities });
  } finally {
    mock.dispose();
  }
}

/**
 * /demo: the bundled demo-run.json, falling back to the sample world's confirmed run.
 * Links point into the data source only when it has the same run (the sample world does).
 */
export async function loadDemoReplay(source: DataSource, url: string, fetcher: Fetcher): Promise<ReplayBundle> {
  const data = (await loadExportedFile(url, fetcher)) ?? (await loadSampleRun());
  if (!data) throw new Error("The sample replay could not be built.");
  const latest = data.deals[data.deals.length - 1] ?? null;
  const [liveRun, sameDeal] = await Promise.all([
    orNull(() => source.getRun(data.run.id)),
    latest ? orNull(() => source.getDeal(latest.id)) : Promise.resolve(null),
  ]);
  const eventDealId = !latest ? null : sameDeal ? sameDeal.id : (liveRun?.dealId ?? null);
  return { data, threadRunId: liveRun?.id ?? null, eventDealId };
}
