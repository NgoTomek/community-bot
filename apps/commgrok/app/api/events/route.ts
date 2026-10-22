import { handle, json, readJson, requireSession } from "@/lib/api";
import { createProposal, HttpError } from "@/lib/workflow";
import { eventInputSchema, zodMessage } from "@/lib/validation";
import { getStore } from "@/lib/store";

/** Team members: create a proposal from the manual form (/approvals/new). */
export function POST(req: Request) {
  return handle(async () => {
    const session = await requireSession();
    const parsed = eventInputSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, zodMessage(parsed.error));
    const team = (await getStore().listTeams()).find((t) => t.id === session.teamId);
    const ev = await createProposal(parsed.data, "manual", `${session.name}${team ? ` (${team.name})` : ""}`);
    return json({ id: ev.id, slug: ev.slug }, 201);
  });
}
