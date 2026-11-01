import { and, eq, inArray, isNull } from "drizzle-orm";
import type { db } from "@/db/client.server";
import {
  disciplines,
  instructorQualifications,
  people,
  programs,
  seasons,
} from "@/db/schema";

type Connection =
  typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Teaching disciplines belong to an instructor, not to the program that first recorded them. */
export async function instructorQualificationsForProgram(
  connection: Connection,
  programId: string,
  instructorIds: ReadonlyArray<string>,
) {
  if (!instructorIds.length) return [];
  const targets = await connection
    .select({
      id: disciplines.id,
      key: disciplines.key,
      organizationId: seasons.organizationId,
    })
    .from(disciplines)
    .innerJoin(programs, eq(programs.id, disciplines.programId))
    .innerJoin(seasons, eq(seasons.id, programs.seasonId))
    .where(
      and(eq(disciplines.programId, programId), eq(disciplines.active, true)),
    );
  const organizationId = targets[0]?.organizationId;
  if (!organizationId) return [];
  const recorded = await connection
    .select({
      instructorId: instructorQualifications.instructorId,
      key: disciplines.key,
      archivedAt: people.archivedAt,
    })
    .from(instructorQualifications)
    .innerJoin(people, eq(people.id, instructorQualifications.instructorId))
    .innerJoin(
      disciplines,
      eq(disciplines.id, instructorQualifications.disciplineId),
    )
    .innerJoin(programs, eq(programs.id, disciplines.programId))
    .innerJoin(seasons, eq(seasons.id, programs.seasonId))
    .where(
      and(
        inArray(instructorQualifications.instructorId, [...instructorIds]),
        eq(people.organizationId, organizationId),
        eq(seasons.organizationId, organizationId),
        isNull(people.archivedAt),
      ),
    );
  return [
    ...new Map(
      recorded.flatMap((row) =>
        targets
          .filter((target) => target.key === row.key)
          .map((target) => {
            const qualification = {
              instructorId: row.instructorId,
              disciplineId: target.id,
              archivedAt: row.archivedAt,
            };
            return [row.instructorId + ":" + target.id, qualification] as const;
          }),
      ),
    ).values(),
  ];
}
