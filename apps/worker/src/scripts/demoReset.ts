import { createServiceClient } from "../db";
import { readableError } from "../errors";
import { requireServiceRole } from "../env";

const { url, key } = requireServiceRole();
const client = createServiceClient(url, key);
const { data, error } = await client.rpc("reset_sample_runs");
if (error) {
  console.error(`demo:reset failed: ${readableError(new Error(error.message))}`);
  process.exit(1);
}

const result = (data ?? {}) as { runs?: number; approvals?: number; rsvps_removed?: number };
console.log(
  `Reset ${result.runs ?? 0} sample run(s): ${result.approvals ?? 0} approval(s) back to pending in round 1, ` +
    `${result.rsvps_removed ?? 0} RSVP(s) removed. Real runs were not touched.`,
);
