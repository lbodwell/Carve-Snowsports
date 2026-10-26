import { eq, inArray } from "drizzle-orm";
import type { db } from "@/db/client.server";
import type { LifecycleGroup } from "@/domain/grouping/group-lifecycle";
import {
  abilityLevels,
  ageBands,
  disciplines,
  people,
  timeSlots,
} from "@/db/schema";
import { descriptiveGroupLabel } from "@/domain/grouping/group-label";
import { weekdayNames } from "@/domain/grouping/registration-schedule";

type Connection =
  typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Save the names in effect when an event or lesson revision is recorded. */
export async function describeGroups(
  connection: Connection,
  programId: string,
  groups: Array<LifecycleGroup>,
) {
  const [sports, bands, levels, slots] = await Promise.all([
    connection
      .select()
      .from(disciplines)
      .where(eq(disciplines.programId, programId)),
    connection.select().from(ageBands).where(eq(ageBands.programId, programId)),
    connection
      .select()
      .from(abilityLevels)
      .where(eq(abilityLevels.programId, programId)),
    connection
      .select()
      .from(timeSlots)
      .where(eq(timeSlots.programId, programId)),
  ]);
  const leadIds = groups.flatMap((group) =>
    group.leadInstructorId ? [group.leadInstructorId] : [],
  );
  const leads = leadIds.length
    ? await connection
        .select({
          id: people.id,
          firstName: people.firstName,
          lastName: people.lastName,
        })
        .from(people)
        .where(inArray(people.id, leadIds))
    : [];
  const instructorName = (id: string | null) => {
    const person = leads.find((item) => item.id === id);
    return person ? `${person.firstName} ${person.lastName}` : null;
  };
  return groups.map((group) => {
    const peers = groups.filter(
      (item) =>
        item.weekday === group.weekday &&
        item.timeSlotId === group.timeSlotId &&
        item.disciplineId === group.disciplineId &&
        item.ageBandId === group.ageBandId &&
        item.abilityLevelId === group.abilityLevelId,
    );
    const slot = slots.find((item) => item.id === group.timeSlotId);
    const instructor = instructorName(group.leadInstructorId);
    return {
      ...group,
      description: descriptiveGroupLabel({
        context: `${weekdayNames[group.weekday]} · ${slot?.label ?? "Time needed"} · ${slot?.cohort ?? "season"}`,
        discipline: sports.find((item) => item.id === group.disciplineId)
          ?.label,
        ageBand: bands.find((item) => item.id === group.ageBandId)?.label,
        level: levels.find((item) => item.id === group.abilityLevelId)?.label,
        instructor,
        ordinal: group.displayOrdinal,
        duplicate: peers.length > 1,
        duplicateInstructor: Boolean(
          instructor &&
          peers.filter(
            (item) => instructorName(item.leadInstructorId) === instructor,
          ).length > 1,
        ),
      }),
    };
  });
}
