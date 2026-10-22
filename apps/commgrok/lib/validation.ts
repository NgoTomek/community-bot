import { z } from "zod";
import { EVENT_TYPES } from "./types";
import { DEFAULT_TZ } from "./time";

const urlOrPath = z
  .string()
  .trim()
  .refine((v) => v === "" || v.startsWith("/") || /^https?:\/\//i.test(v), "Must be an http(s) URL or a /path");

const nullableText = z
  .string()
  .trim()
  .max(500)
  .nullish()
  .transform((v) => (v ? v : null));

export const hostSchema = z.object({
  name: z.string().trim().min(1).max(80),
  avatar_url: urlOrPath.nullish().transform((v) => (v ? v : null)),
});

/** Full event payload, as sent by the bot or the manual form. */
export const eventInputSchema = z
  .object({
    title: z.string().trim().min(3).max(140),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes")
      .max(80)
      .optional(),
    event_type: z.enum(EVENT_TYPES).default("meetup"),
    communities: z.array(z.string().trim().min(1).max(60)).max(8).default([]),
    description_md: z.string().max(10_000).default(""),
    start_at: z.iso.datetime({ offset: true }),
    end_at: z.iso.datetime({ offset: true }).optional(),
    timezone: z.string().default(DEFAULT_TZ),
    venue_name: nullableText,
    venue_address: nullableText,
    online_url: urlOrPath.nullish().transform((v) => (v ? v : null)),
    cover_url: urlOrPath.nullish().transform((v) => (v ? v : null)),
    capacity: z.number().int().positive().max(100_000).nullish().transform((v) => v ?? null),
    price_label: z.string().trim().max(40).default("Free"),
    hosts: z.array(hostSchema).max(10).default([]),
    visibility: z.enum(["public", "unlisted"]).default("public"),
    required_team_ids: z.array(z.string()).optional(),
  })
  .transform((v) => ({
    ...v,
    end_at: v.end_at ?? new Date(new Date(v.start_at).getTime() + 2 * 3_600_000).toISOString(),
    price_label: v.price_label || "Free",
  }))
  .refine((v) => new Date(v.end_at) >= new Date(v.start_at), { message: "End must be after start", path: ["end_at"] });

export type EventInput = z.output<typeof eventInputSchema>;

/** Partial edit from the review screen. */
export const eventPatchSchema = z.object({
  title: z.string().trim().min(3).max(140).optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes")
    .max(80)
    .optional(),
  event_type: z.enum(EVENT_TYPES).optional(),
  communities: z.array(z.string().trim().min(1).max(60)).max(8).optional(),
  description_md: z.string().max(10_000).optional(),
  start_at: z.iso.datetime({ offset: true }).optional(),
  end_at: z.iso.datetime({ offset: true }).optional(),
  timezone: z.string().optional(),
  venue_name: nullableText.optional(),
  venue_address: nullableText.optional(),
  online_url: urlOrPath.nullish().transform((v) => (v ? v : null)).optional(),
  cover_url: urlOrPath.nullish().transform((v) => (v ? v : null)).optional(),
  capacity: z.number().int().positive().max(100_000).nullish().optional(),
  price_label: z.string().trim().max(40).optional(),
  hosts: z.array(hostSchema).max(10).optional(),
  visibility: z.enum(["public", "unlisted"]).optional(),
});

/** Bot revision (PUT /api/proposals/[id]): any subset of the event fields plus an optional message. */
export const revisionSchema = eventPatchSchema.extend({
  message: z.string().trim().max(1000).optional(),
});
export type RevisionInput = z.output<typeof revisionSchema>;

/** Organiser decision. Legacy "changes_requested" is accepted and read as "renegotiate". */
export const decisionSchema = z.object({
  decision: z
    .enum(["approved", "rejected", "renegotiate", "changes_requested"])
    .transform((d) => (d === "changes_requested" ? "renegotiate" : d)),
  note: z.string().trim().max(1000).nullish(),
});

export const rsvpSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(80),
  email: z.email("Please enter a valid email").max(200),
});

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[×x]\s/g, "x-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function zodMessage(err: z.ZodError) {
  return err.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; ");
}
