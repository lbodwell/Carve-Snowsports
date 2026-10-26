import { z } from "zod";

export const groupingViewSchema = z.object({
  allSessions: z.coerce.boolean().optional(),
  programId: z.uuid().optional().catch(undefined),
  weekday: z.coerce.number().int().min(0).max(6).optional().catch(undefined),
  timeSlotId: z.uuid().optional().catch(undefined),
  disciplineId: z.uuid().optional().catch(undefined),
  ageBandId: z.uuid().optional().catch(undefined),
  levelId: z.uuid().optional().catch(undefined),
  groupSize: z.coerce.number().int().min(0).optional().catch(undefined),
  staffing: z.enum(["staffed", "unstaffed"]).optional().catch(undefined),
  view: z.enum(["all", "unplaced", "review"]).optional().catch(undefined),
});
export type GroupingView = z.infer<typeof groupingViewSchema>;
