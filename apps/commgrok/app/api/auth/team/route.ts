import { z } from "zod";
import { handle, json, readJson, requireUser } from "@/lib/api";
import { getStore } from "@/lib/store";
import { safeNext } from "@/lib/auth";
import { HttpError } from "@/lib/workflow";

const schema = z.object({ teamId: z.string().trim().min(1).max(100), next: z.string().optional() });

/** Set or switch the logged-in organiser's team. Every account must have a team (null is rejected). */
export function POST(req: Request) {
  return handle(async () => {
    const session = await requireUser();
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, "Pick a team");
    const { teamId, next } = parsed.data;
    const team = (await getStore().listTeams()).find((t) => t.id === teamId);
    if (!team) throw new HttpError(400, "Unknown team");
    await getStore().updateUser(session.userId, { team_id: teamId });
    return json({ ok: true, team, redirect: safeNext(next, "/approvals") });
  });
}
