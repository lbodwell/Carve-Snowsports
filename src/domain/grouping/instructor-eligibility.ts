import { instructorAvailability } from "./instructor-preferences";
import type { InstructorPreference } from "./instructor-preferences";
import type { SessionCalendar } from "@/domain/calendar/session-calendar";
import { sessionsOverlap } from "@/domain/calendar/session-calendar";

type Group = {
  id: string;
  weekday: number;
  timeSlotId: string;
  disciplineId: string | null;
  instructorIds: Array<string>;
};
export function groupInstructorEligibility(
  instructor: {
    id: string;
    disciplineIds: Array<string>;
    preferences: Array<InstructorPreference>;
  },
  target: Pick<Group, "id" | "weekday" | "timeSlotId" | "disciplineId">,
  groups: ReadonlyArray<Group>,
  slots: ReadonlyArray<
    SessionCalendar & {
      id: string;
      allowedWeekdays: ReadonlyArray<number>;
      cohort: string;
    }
  >,
  programId: string,
  age?: { minimumAge: number; maximumAge: number },
  level?: number,
) {
  const unavailable = (reason: string) => ({
    eligible: false,
    score: 0,
    reason,
  });
  const slot = slots.find((item) => item.id === target.timeSlotId);
  if (!slot || !slot.allowedWeekdays.includes(target.weekday))
    return unavailable("Choose an active lesson session");
  if (
    !target.disciplineId ||
    !instructor.disciplineIds.includes(target.disciplineId)
  )
    return unavailable("Not qualified for this discipline");
  const availability = instructorAvailability(
    instructor.preferences,
    { ...slot, programId, weekday: target.weekday },
    age,
    level,
  );
  if (!availability.eligible) return availability;
  if (
    groups.some((other) => {
      const otherSlot = slots.find((item) => item.id === other.timeSlotId);
      return (
        other.id !== target.id &&
        other.weekday === target.weekday &&
        other.instructorIds.includes(instructor.id) &&
        otherSlot &&
        sessionsOverlap(slot, otherSlot, target.weekday)
      );
    })
  )
    return unavailable("Already assigned to an overlapping lesson");
  return availability;
}
