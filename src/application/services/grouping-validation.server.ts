import { eq, inArray } from "drizzle-orm";
import type { db } from "@/db/client.server";
import { instructorAvailability } from "@/domain/grouping/instructor-preferences";
import { ApplicationError } from "@/application/errors";
import {
  disciplines,
  groupingDraftAssignments,
  groupingDraftGroups,
  groupingDraftInstructors,
  groupingDrafts,
  instructors as instructorProfiles,
  instructorQualifications,
  people,
  registrations,
  timeSlots,
} from "@/db/schema";
import { sessionsOverlap } from "@/domain/calendar/session-calendar";
import { resolveRegistrationSchedule } from "@/domain/grouping/registration-schedule";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Re-read mutable enrollment and qualifications at workflow boundaries. */
export async function validateGroupingDraft(
  tx: Transaction,
  draftId: string,
  onlyGroupId?: string,
) {
  const [draft] = await tx
    .select()
    .from(groupingDrafts)
    .where(eq(groupingDrafts.id, draftId));
  if (!draft) throw new ApplicationError("NOT_FOUND", "Draft not found.");
  const slots = await tx
    .select()
    .from(timeSlots)
    .where(eq(timeSlots.programId, draft.programId));
  const groups = await tx
    .select()
    .from(groupingDraftGroups)
    .where(eq(groupingDraftGroups.draftId, draftId));
  const assignments = await tx
    .select({
      groupId: groupingDraftAssignments.draftGroupId,
      programId: registrations.programId,
      studentId: registrations.studentId,
      status: registrations.status,
      archivedAt: registrations.archivedAt,
      personArchivedAt: people.archivedAt,
      disciplineId: registrations.disciplineId,
      sourceSnapshot: registrations.sourceSnapshot,
    })
    .from(groupingDraftAssignments)
    .innerJoin(
      registrations,
      eq(registrations.id, groupingDraftAssignments.registrationId),
    )
    .innerJoin(people, eq(people.id, registrations.studentId))
    .where(eq(groupingDraftAssignments.draftId, draftId));
  const groupIds = groups.map((group) => group.id);
  const staff = groupIds.length
    ? await tx
        .select()
        .from(groupingDraftInstructors)
        .where(inArray(groupingDraftInstructors.draftGroupId, groupIds))
    : [];
  const qualifications = await tx
    .select({
      instructorId: instructorQualifications.instructorId,
      disciplineId: instructorQualifications.disciplineId,
      archivedAt: people.archivedAt,
    })
    .from(instructorQualifications)
    .innerJoin(people, eq(people.id, instructorQualifications.instructorId))
    .innerJoin(
      disciplines,
      eq(disciplines.id, instructorQualifications.disciplineId),
    )
    .where(eq(disciplines.programId, draft.programId));
  const availability = await tx
    .select()
    .from(instructorProfiles)
    .where(
      inArray(
        instructorProfiles.personId,
        staff.length
          ? staff.map((item) => item.instructorId)
          : ["00000000-0000-0000-0000-000000000000"],
      ),
    );
  const fail = (message: string): never => {
    throw new ApplicationError("VALIDATION", message);
  };
  for (const group of groups.filter(
    (row) => !onlyGroupId || row.id === onlyGroupId,
  )) {
    const slot = slots.find(
      (item) => item.id === group.timeSlotId && item.active,
    );
    if (!slot) fail("A group uses an inactive or unavailable lesson time.");
    if (!slot!.allowedWeekdays.includes(group.weekday))
      fail("This lesson time is inactive on the selected day.");
    const members = assignments.filter((row) => row.groupId === group.id);
    for (const member of members) {
      if (
        member.status !== "active" ||
        member.archivedAt ||
        member.personArchivedAt ||
        member.programId !== draft.programId
      )
        fail(
          "Remove inactive or incompatible registrations before continuing.",
        );
      if (!member.disciplineId || member.disciplineId !== group.disciplineId)
        fail(
          "Every student must have the same registered discipline as their group.",
        );
      const schedule = resolveRegistrationSchedule(
        member.sourceSnapshot,
        slots,
      );
      if (member.sourceSnapshot?.sourceKey && !schedule)
        fail("Confirm imported lesson sessions before continuing.");
      if (
        schedule &&
        (schedule.weekday !== group.weekday ||
          schedule.timeSlotId !== group.timeSlotId)
      )
        fail("A student is placed outside their confirmed lesson session.");
      for (const other of assignments.filter(
        (row) => row.studentId === member.studentId && row.groupId !== group.id,
      )) {
        const otherGroup = groups.find((item) => item.id === other.groupId);
        const otherSlot = slots.find(
          (item) => item.id === otherGroup?.timeSlotId,
        );
        if (
          otherGroup?.weekday === group.weekday &&
          otherSlot &&
          sessionsOverlap(slot!, otherSlot, group.weekday)
        )
          fail(
            "A student has overlapping lessons, including across separate registrations.",
          );
      }
    }
    const instructors = staff.filter((row) => row.draftGroupId === group.id);
    if (
      group.leadInstructorId &&
      !instructors.some((row) => row.instructorId === group.leadInstructorId)
    )
      fail("The lead instructor must be on the group’s instructor list.");
    for (const instructor of instructors) {
      if (
        !instructorAvailability(
          availability.find((item) => item.personId === instructor.instructorId)
            ?.preferences ?? [],
          { ...slot!, programId: draft.programId, weekday: group.weekday },
        ).eligible
      )
        fail("An instructor has no recorded availability for this session.");
      if (
        !qualifications.some(
          (row) =>
            row.instructorId === instructor.instructorId &&
            row.disciplineId === group.disciplineId &&
            !row.archivedAt,
        )
      )
        fail(
          "An assigned instructor is archived or no longer qualified for the group.",
        );
      for (const other of staff.filter(
        (row) =>
          row.instructorId === instructor.instructorId &&
          row.draftGroupId !== group.id,
      )) {
        const otherGroup = groups.find(
          (item) => item.id === other.draftGroupId,
        );
        const otherSlot = slots.find(
          (item) => item.id === otherGroup?.timeSlotId,
        );
        if (
          otherGroup?.weekday === group.weekday &&
          otherSlot &&
          sessionsOverlap(slot!, otherSlot, group.weekday)
        )
          fail("An instructor is assigned to overlapping lesson times.");
      }
    }
  }
}
