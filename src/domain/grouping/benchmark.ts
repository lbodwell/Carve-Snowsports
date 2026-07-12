import { performance } from "node:perf_hooks";

import { generateGroupingDraft } from "@/domain/grouping/engine";

const registrations = Array.from({ length: 500 }, (_, index) => ({
  id: `student-${index}`,
  abilityRank: (index % 6) + 1,
  ageBand: index % 2 === 0 ? "4-6" : "7-12",
  discipline: index % 3 === 0 ? "snowboard" : "ski",
  available: true,
  mustSeparateFrom: new Set<string>(),
  preferTogetherWith: new Set<string>(),
}));
const instructors = Array.from({ length: 50 }, (_, index) => ({
  id: `instructor-${index}`,
  disciplines: new Set(index % 2 === 0 ? ["ski"] : ["snowboard"]),
  available: true,
  capacity: 20,
}));

const startedAt = performance.now();
const result = generateGroupingDraft(registrations, instructors, {
  maximumStudentsPerGroup: 8,
  targetStudentsPerGroup: 6,
  minimumInstructorsPerGroup: 1,
});
const durationMs = performance.now() - startedAt;

console.info(
  JSON.stringify({
    registrations: registrations.length,
    groups: result.groups.length,
    unplaced: result.unplaced.length,
    durationMs: Math.round(durationMs * 100) / 100,
  }),
);
