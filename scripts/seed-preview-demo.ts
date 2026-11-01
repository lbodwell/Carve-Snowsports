import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { verifiedMigrationTarget } from "../src/domain/deployment/release-policy";
import { verifiedPreviewDatabase } from "../src/domain/deployment/preview-policy";
import { MIGRATION_LOCK } from "./migrate-release";

async function seedPreviewDemo() {
  if (process.env.RELEASE_ENVIRONMENT !== "preview")
    throw new Error("Synthetic hosted seeding is restricted to Preview.");
  const target = verifiedMigrationTarget(process.env);
  verifiedPreviewDatabase(target.url);
  const password = process.env.PREVIEW_DEMO_PASSWORD;
  if (!password || password.length < 24)
    throw new Error("Configure a generated Preview-only demo password first.");
  const sql = postgres(target.url, {
    max: 1,
    prepare: false,
    ssl: { rejectUnauthorized: true },
    connect_timeout: 15,
  });
  let locked = false;
  try {
    const [lock] =
      await sql`select pg_try_advisory_lock(${MIGRATION_LOCK[0]},${MIGRATION_LOCK[1]}) as acquired`;
    if (!lock?.acquired)
      throw new Error("Preview is busy with another migration or seed.");
    locked = true;
    const [other] =
      await sql`select count(*)::int as count from organizations where name <> 'Carve Demo Ski School'`;
    if (other?.count)
      throw new Error(
        "Preview contains another organization; refusing demo seeding.",
      );
    const [done] =
      await sql`select count(*)::int as count from registrations where source_snapshot->>'previewDemoVersion'='1'`;
    if (done?.count) {
      console.log(
        "Synthetic Preview demo already exists; roster and login are preserved.",
      );
      return;
    }

    // Reuse the existing demo organization/admin fixture, with a strong hosted
    // password. The auth secret below only satisfies seed-time configuration;
    // it is never written to Vercel and does not replace the app's auth secret.
    execFileSync(process.execPath, ["run", "src/db/seed.ts"], {
      stdio: "pipe",
      env: {
        ...process.env,
        DATABASE_URL: target.url,
        DEV_ADMIN_PASSWORD: password,
        APP_ORIGIN: "https://carve-preview.example.test",
        BETTER_AUTH_URL: "https://carve-preview.example.test",
        BETTER_AUTH_SECRET:
          "preview-seed-only-configuration-not-used-for-auth-signing",
      },
    });

    await sql.begin(async (tx) => {
      const [program] = await tx<
        Array<{ id: string; organization_id: string }>
      >`select p.id,s.organization_id from programs p join seasons s on s.id=p.season_id join organizations o on o.id=s.organization_id where o.name='Carve Demo Ski School' order by p.created_at limit 1`;
      if (!program) throw new Error("Demo program was not created.");
      const slots = [
        {
          key: "am",
          label: "Morning",
          start: "10:00",
          end: "12:00",
          cohort: "season",
          days: [6, 0],
        },
        {
          key: "pm",
          label: "Afternoon",
          start: "13:00",
          end: "15:00",
          cohort: "season",
          days: [6, 0],
        },
        {
          key: "full",
          label: "Full day",
          start: "10:00",
          end: "15:00",
          cohort: "season",
          days: [6, 0],
        },
        {
          key: "advanced-am",
          label: "Ages 11–13 AM",
          start: "09:00",
          end: "12:00",
          cohort: "season",
          days: [6, 0],
        },
        {
          key: "session-1-am",
          label: "Session 1 AM",
          start: "09:30",
          end: "11:00",
          cohort: "session-1",
          days: [4, 5],
        },
        {
          key: "session-2-am",
          label: "Session 2 AM",
          start: "09:30",
          end: "11:00",
          cohort: "session-2",
          days: [4, 5],
        },
      ];
      for (const [index, slot] of slots.entries())
        await tx`insert into time_slots (program_id,key,label,starts_at,ends_at,cohort,allowed_weekdays,display_order) values (${program.id},${slot.key},${slot.label},${slot.start},${slot.end},${slot.cohort},${JSON.stringify(slot.days)}::jsonb,${index}) on conflict (program_id,key) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,cohort=excluded.cohort,allowed_weekdays=excluded.allowed_weekdays`;
      await tx`insert into age_bands (program_id,label,minimum_age,maximum_age,display_order) select ${program.id},'Ages 11–13',11,13,3 where not exists (select 1 from age_bands where program_id=${program.id} and minimum_age=11 and maximum_age=13)`;
      const configured = await tx<
        Array<{ id: string; key: string }>
      >`select id,key from time_slots where program_id=${program.id}`;
      const slotIds = new Map(configured.map((slot) => [slot.key, slot.id]));
      const disciplines = await tx<
        Array<{ id: string; key: string }>
      >`select id,key from disciplines where program_id=${program.id}`;
      const levels = await tx<
        Array<{ id: string; numeric_rank: number }>
      >`select id,numeric_rank from ability_levels where program_id=${program.id}`;
      await tx`update registrations set source_snapshot=jsonb_build_object('previewDemoVersion',1,'weekday','Saturday','session','10am','groupingSchedule',jsonb_build_object('weekday',6,'timeSlotId',${slotIds.get("am")!}::text)) where program_id=${program.id}`;
      const names = [
        "Ari",
        "Blair",
        "Cameron",
        "Devon",
        "Emery",
        "Finley",
        "Gray",
        "Harper",
        "Indigo",
        "Jules",
        "Kai",
        "Logan",
        "Marin",
        "Noel",
        "Oakley",
        "Parker",
        "Quinn",
        "Reese",
        "Sage",
        "Theo",
        "Vale",
        "Wren",
      ];
      let nameIndex = 0;
      for (const slot of slots) {
        for (const weekday of slot.days) {
          // The base fixture already supplies Saturday's regular AM students.
          if (slot.key === "am" && weekday === 6) continue;
          for (let index = 0; index < 2; index++) {
            const firstName = names[nameIndex++]!;
            const age =
              slot.key === "advanced-am"
                ? 12 + index
                : slot.cohort === "season"
                  ? 8 + index
                  : 5;
            const discipline = disciplines.find(
              (item) => item.key === (index === 0 ? "ski" : "snowboard"),
            )!;
            const level = levels.find(
              (item) =>
                item.numeric_rank === (slot.key === "advanced-am" ? 4 : 2),
            )!;
            const [person] = await tx<
              Array<{ id: string }>
            >`insert into people (organization_id,first_name,last_name,date_of_birth) values (${program.organization_id},${firstName},'Demo',${`${2026 - age}-01-02`}) returning id`;
            if (!person) throw new Error("Could not create synthetic student.");
            await tx`insert into students (person_id,notes) values (${person.id},'Synthetic demo student. Benefits from clear demonstrations and a short warm-up.')`;
            const source = {
              previewDemoVersion: 1,
              weekday: [
                "Sunday",
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
              ][weekday],
              session:
                slot.cohort === "session-1"
                  ? "Session 1"
                  : slot.cohort === "session-2"
                    ? "Session 2"
                    : slot.key === "advanced-am"
                      ? "9am"
                      : slot.key === "pm"
                        ? "1pm"
                        : slot.key === "full"
                          ? "Full day"
                          : "10am",
              groupingSchedule: { weekday, timeSlotId: slotIds.get(slot.key) },
            };
            await tx`insert into registrations (program_id,student_id,discipline_id,ability_level_id,status,source_snapshot) values (${program.id},${person.id},${discipline.id},${level.id},'active',${JSON.stringify(source)}::jsonb)`;
          }
        }
      }
      const preferences = [
        {
          programId: program.id,
          cohort: "season",
          weekday: 6,
          startsAt: "09:00",
          endsAt: "15:00",
        },
        {
          programId: program.id,
          cohort: "season",
          weekday: 0,
          startsAt: "09:00",
          endsAt: "15:00",
        },
        ...[4, 5].flatMap((weekday) =>
          ["session-1", "session-2"].map((cohort) => ({
            programId: program.id,
            cohort,
            weekday,
            startsAt: "09:30",
            endsAt: "11:00",
          })),
        ),
      ].map((item) => ({
        ...item,
        minimumAge: null,
        maximumAge: null,
        minimumLevel: null,
        maximumLevel: null,
      }));
      await tx`update instructors set preferences=${JSON.stringify(preferences)}::jsonb where person_id in (select id from people where organization_id=${program.organization_id})`;
      for (const [first, last, key] of [
        ["Drew", "Demo", "ski"],
        ["Robin", "Demo", "ski"],
        ["Taylor", "Demo", "snowboard"],
      ]) {
        const [person] = await tx<
          Array<{ id: string }>
        >`insert into people (organization_id,first_name,last_name) values (${program.organization_id},${first!},${last!}) returning id`;
        if (!person) throw new Error("Could not create synthetic instructor.");
        await tx`insert into instructors (person_id,preferences) values (${person.id},${JSON.stringify(preferences)}::jsonb)`;
        await tx`insert into instructor_qualifications (instructor_id,discipline_id) values (${person.id},${disciplines.find((item) => item.key === key)!.id})`;
      }
    });
    const [counts] =
      await sql`select (select count(*)::int from students) as students,(select count(*)::int from instructors) as instructors,(select count(*)::int from time_slots) as time_slots`;
    console.log(JSON.stringify({ syntheticDemoReady: true, ...counts }));
  } finally {
    if (locked)
      await sql`select pg_advisory_unlock(${MIGRATION_LOCK[0]},${MIGRATION_LOCK[1]})`;
    await sql.end({ timeout: 5 });
  }
}

seedPreviewDemo().catch(() => {
  console.error(
    "Preview demo seeding failed. Verify the isolated target, existing organizations, and Preview-only password; no credential values were logged.",
  );
  process.exitCode = 1;
});
