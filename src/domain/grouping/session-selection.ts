import type { RegistrationSchedule } from "./registration-schedule";

export function validSessionSelection(
  slots: ReadonlyArray<{ id: string; allowedWeekdays: ReadonlyArray<number> }>,
  value: Partial<RegistrationSchedule> | null,
): RegistrationSchedule | null {
  if (!value || typeof value !== "object") return null;
  const slot = slots.find((item) => item.id === value.timeSlotId);
  return slot &&
    value.weekday !== undefined &&
    slot.allowedWeekdays.includes(value.weekday)
    ? { weekday: value.weekday, timeSlotId: slot.id }
    : null;
}
