import type { Workspace } from "@/features/grouping/group-building-workspace";

export function createGroupingWorkspaceFixture(): Workspace {
  return {
    rebuildHistory: [],
    program: {
      id: "program",
      name: "Weekend lessons",
      seasonName: "Winter 2027",
      seasonStartsOn: "2027-01-01",
    },
    availablePrograms: [
      { id: "program", name: "Weekend lessons", seasonName: "Winter 2027" },
    ],
    draft: { id: "draft", version: 1, status: "editing" },

    roster: [
      {
        registrationId: "avery",
        registrationStatus: "active",
        firstName: "Avery",
        lastName: "Chen",
        dateOfBirth: "2017-01-08",
        disciplineId: "ski",
        abilityLevelId: "level3",
        schedule: null,
        needsSchedule: false,
        survey: null,
      },
      {
        registrationId: "rowan",
        registrationStatus: "active",
        firstName: "Rowan",
        lastName: "Patel",
        dateOfBirth: "2017-03-14",
        disciplineId: "ski",
        abilityLevelId: "level3",
        schedule: null,
        needsSchedule: false,
        survey: null,
      },
    ],
    assignments: [
      {
        registrationId: "avery",
        registrationStatus: "active",
        draftGroupId: "group1",
      },
      {
        registrationId: "rowan",
        registrationStatus: "active",
        draftGroupId: "group2",
      },
    ],
    groups: [
      {
        id: "group1",
        displayOrdinal: 1,
        weekday: 6,
        timeSlotId: "morning",
        disciplineId: "ski",
        abilityLevelId: "level3",
        ageBandId: null,
        leadInstructorId: "jordan",
        notes: "",
        instructorIds: ["jordan"],
      },
      {
        id: "group2",
        displayOrdinal: 2,
        weekday: 0,
        timeSlotId: "morning",
        disciplineId: "ski",
        abilityLevelId: "level3",
        ageBandId: null,
        leadInstructorId: null,
        notes: "",
        instructorIds: [],
      },
    ],
    instructors: [
      {
        id: "jordan",
        firstName: "Jordan",
        lastName: "Lee",
        disciplineIds: ["ski"],
        preferences: [],
      },
    ],
    disciplines: [{ id: "ski", label: "Ski" }],
    abilityLevels: [{ id: "level3", label: "Level 3" }],
    ageBands: [],
    timeSlots: [
      {
        id: "morning",
        label: "Morning",
        startsAt: "10:00",
        endsAt: "12:00",
        cohort: "season",
        startsOn: null,
        endsOn: null,
        excludedDates: [],
        allowedWeekdays: [0, 6],
      },
    ],
    capabilities: { canEdit: true, canApprove: true, canUndo: true },
    unplacedReasons: {},
  } as unknown as Workspace;
}
