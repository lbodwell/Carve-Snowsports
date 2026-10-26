import { z } from "zod";

export const surveyResponseQuerySchema = z.object({
  sort: z.enum(["newest", "oldest", "name"]).catch("newest"),
  q: z.string().trim().max(200).catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce
    .number()
    .refine((value) => [10, 25, 50, 100].includes(value))
    .catch(10),
  link: z.enum(["all", "linked", "unlinked", "review"]).catch("all"),
  session: z.string().max(100).catch(""),
  discipline: z.enum(["", "ski", "snowboard"]).catch(""),
  level: z.string().max(30).catch(""),
  from: z.union([z.iso.date(), z.literal("")]).catch(""),
  until: z.union([z.iso.date(), z.literal("")]).catch(""),
  programId: z.uuid().optional().catch(undefined),
  surveyId: z.uuid().optional().catch(undefined),
});
