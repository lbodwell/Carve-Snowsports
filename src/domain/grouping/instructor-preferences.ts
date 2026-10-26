import { z } from "zod";

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const instructorPreferenceSchema = z
  .object({
    programId: z.uuid(),
    cohort: z.enum(["season", "session-1", "session-2"]),
    weekday: z.number().int().min(0).max(6),
    startsAt: clock,
    endsAt: clock,
    minimumAge: z.number().int().min(0).max(100).nullable(),
    maximumAge: z.number().int().min(0).max(100).nullable(),
    minimumLevel: z.number().int().min(1).max(20).nullable(),
    maximumLevel: z.number().int().min(1).max(20).nullable(),
  })
  .refine(
    (value) => value.startsAt < value.endsAt,
    "End time must follow start time.",
  )
  .refine(
    (value) =>
      value.minimumAge === null ||
      value.maximumAge === null ||
      value.minimumAge <= value.maximumAge,
    "Invalid age range.",
  )
  .refine(
    (value) =>
      value.minimumLevel === null ||
      value.maximumLevel === null ||
      value.minimumLevel <= value.maximumLevel,
    "Invalid level range.",
  );
export type InstructorPreference = z.infer<typeof instructorPreferenceSchema>;
export function instructorAvailability(
  preferences: Array<InstructorPreference>,
  session: {
    programId: string;
    weekday: number;
    cohort: string;
    startsAt: string;
    endsAt: string;
  },
  age?: { minimumAge: number; maximumAge: number },
  level?: number,
) {
  const matches = preferences.filter(
    (item) =>
      item.programId === session.programId &&
      item.weekday === session.weekday &&
      item.cohort === session.cohort &&
      item.startsAt <= session.startsAt.slice(0, 5) &&
      item.endsAt >= session.endsAt.slice(0, 5),
  );
  if (!matches.length)
    return {
      eligible: false,
      score: 0,
      reason: preferences.length
        ? "Outside recorded availability"
        : "Availability unknown",
    };
  const scores = matches.map(
    (item) =>
      Number(
        Boolean(
          age &&
          (item.minimumAge !== null || item.maximumAge !== null) &&
          (item.minimumAge === null || age.minimumAge >= item.minimumAge) &&
          (item.maximumAge === null || age.maximumAge <= item.maximumAge),
        ),
      ) +
      Number(
        Boolean(
          level &&
          (item.minimumLevel !== null || item.maximumLevel !== null) &&
          (item.minimumLevel === null || level >= item.minimumLevel) &&
          (item.maximumLevel === null || level <= item.maximumLevel),
        ),
      ),
  );
  const score = Math.max(...scores);
  return {
    eligible: true,
    score,
    reason: score
      ? `Available · ${score} age/level preferences matched`
      : "Available · no matching preference",
  };
}
