import { handle, json, readJson } from "@/lib/api";
import { registerRsvp, HttpError } from "@/lib/workflow";
import { rsvpSchema, zodMessage } from "@/lib/validation";

/** Public: register for a published event. Waitlists automatically when full. */
export function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const parsed = rsvpSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, zodMessage(parsed.error));
    const { rsvp, already } = await registerRsvp(id, parsed.data.name, parsed.data.email);
    return json({ status: rsvp.status, already }, already ? 200 : 201);
  });
}
