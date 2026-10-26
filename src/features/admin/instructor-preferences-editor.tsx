import { useEffect, useState } from "react";
import type { InstructorPreference } from "@/domain/grouping/instructor-preferences";
import { RefreshButton } from "@/components/refresh-button";
import {
  loadInstructorPreferences,
  updateInstructorPreferences,
} from "@/server/functions/instructors";
import { Button } from "@/components/ui/button";

export function InstructorPreferencesEditor({
  instructorId,
}: {
  instructorId: string;
}) {
  const [context, setContext] = useState<Awaited<
    ReturnType<typeof loadInstructorPreferences>
  > | null>(null);
  const [rows, setRows] = useState<Array<InstructorPreference>>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    loadInstructorPreferences({ data: { instructorId } })
      .then((value) => {
        if (active) {
          setContext(value);
          setRows(value.preferences);
        }
      })
      .catch(() => {
        if (active) setMessage("Could not load preferences.");
      });
    return () => {
      active = false;
    };
  }, [instructorId]);
  const change = (index: number, value: Partial<InstructorPreference>) =>
    setRows((previous) =>
      previous.map((row, position) =>
        position === index ? { ...row, ...value } : row,
      ),
    );
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <RefreshButton
        onRefresh={async () => {
          const clean =
            !context ||
            JSON.stringify(rows) === JSON.stringify(context.preferences);
          const latest = await loadInstructorPreferences({
            data: { instructorId },
          });
          setContext(latest);
          if (clean) setRows(latest.preferences);
          else
            setMessage(
              "Availability refreshed; your unsaved edits are preserved.",
            );
        }}
      />
      <h3 className="font-semibold">Availability and teaching preferences</h3>
      <p className="text-muted-foreground text-sm">
        Day and time determine availability. Age and level ranges rank
        suggestions.
      </p>
      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap gap-2 rounded border p-2">
          <label>
            Program
            <select
              value={row.programId}
              onChange={(e) => change(index, { programId: e.target.value })}
            >
              {context?.programs.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.seasonName} · {program.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cohort
            <select
              value={row.cohort}
              onChange={(e) =>
                change(index, {
                  cohort: e.target.value as InstructorPreference["cohort"],
                })
              }
            >
              {["season", "session-1", "session-2"].map((cohort) => (
                <option key={cohort}>{cohort}</option>
              ))}
            </select>
          </label>
          <label>
            Day
            <select
              value={row.weekday}
              onChange={(e) =>
                change(index, { weekday: Number(e.target.value) })
              }
            >
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                (day, value) => (
                  <option key={day} value={value}>
                    {day}
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            From
            <input
              type="time"
              value={row.startsAt}
              onChange={(e) => change(index, { startsAt: e.target.value })}
            />
          </label>
          <label>
            Until
            <input
              type="time"
              value={row.endsAt}
              onChange={(e) => change(index, { endsAt: e.target.value })}
            />
          </label>
          {(
            [
              ["minimumAge", "Min age"],
              ["maximumAge", "Max age"],
              ["minimumLevel", "Min level"],
              ["maximumLevel", "Max level"],
            ] as const
          ).map(([field, label]) => (
            <label key={field}>
              {label}
              <input
                className="w-16 border"
                type="number"
                value={row[field] ?? ""}
                onChange={(e) =>
                  change(index, {
                    [field]:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </label>
          ))}
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              setRows((previous) =>
                previous.filter((_, position) => position !== index),
              )
            }
          >
            Remove window
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={!context?.programs.length || busy}
        onClick={() =>
          setRows((previous) => [
            ...previous,
            {
              programId: context!.programs[0]!.id,
              cohort: "season",
              weekday: 6,
              startsAt: "09:00",
              endsAt: "15:00",
              minimumAge: null,
              maximumAge: null,
              minimumLevel: null,
              maximumLevel: null,
            },
          ])
        }
      >
        Add availability
      </Button>
      <Button
        type="button"
        disabled={!context || busy}
        onClick={async () => {
          setBusy(true);
          try {
            await updateInstructorPreferences({
              data: { instructorId, preferences: rows },
            });
            setContext((previous) =>
              previous ? { ...previous, preferences: rows } : previous,
            );
            setMessage("Preferences saved.");
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Save failed.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Save preferences
      </Button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
