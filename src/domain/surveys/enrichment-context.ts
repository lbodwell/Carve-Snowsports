import {
  resolveRegistrationSchedule,
  weekdayNames,
} from "../grouping/registration-schedule";

export function surveyMatchesRegistrationSession(
  session: string,
  source: Record<string, unknown> | null,
  slots: Array<{
    id: string;
    label: string;
    startsAt: string;
    endsAt: string;
    cohort: string;
  }>,
) {
  const parts = session.match(
    /^([a-z]+)-(?:am|pm|full)-(\d{4})-(\d{4})(?:-(session-[12]|advanced))?$/,
  );
  if (!parts) return false;
  const schedule = resolveRegistrationSchedule(source, slots);
  if (!schedule || weekdayNames[schedule.weekday]?.toLowerCase() !== parts[1])
    return false;
  const slot = slots.find((item) => item.id === schedule.timeSlotId);
  return Boolean(
    slot &&
    slot.startsAt.slice(0, 5).replace(":", "") === parts[2] &&
    slot.endsAt.slice(0, 5).replace(":", "") === parts[3] &&
    slot.cohort === (parts[4]?.startsWith("session-") ? parts[4] : "season"),
  );
}
