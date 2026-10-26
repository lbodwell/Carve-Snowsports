import { useEffect, useState } from "react";
import { CalendarDays, GraduationCap } from "lucide-react";
import type { InstructorPreference } from "@/domain/grouping/instructor-preferences";
import { teachingPeriod } from "@/domain/grouping/instructor-preferences";
import { loadInstructorPreferences } from "@/server/functions/instructors";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Slot = "am" | "pm" | "full" | "weekday";
const days = [
  { day: 4, label: "Thursday" },
  { day: 5, label: "Friday" },
  { day: 6, label: "Saturday" },
  { day: 0, label: "Sunday" },
];
export function InstructorPreferencesEditor({
  instructorId,
  onChange,
}: {
  instructorId?: string;
  onChange: (rows: Array<InstructorPreference>) => void;
}) {
  const [rows, setRows] = useState<Array<InstructorPreference>>([]);
  const [loading, setLoading] = useState(Boolean(instructorId));
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!instructorId) return;
    let active = true;
    setLoading(true);
    setError("");
    loadInstructorPreferences({ data: { instructorId } })
      .then((data) => {
        if (active) setRows(data.preferences);
      })
      .catch(() => {
        if (active) setError("Availability could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [instructorId, attempt]);
  const slotsFor = (day: number): Array<Slot> => [
    ...new Set(
      rows
        .filter((row) => row.weekday === day)
        .map((row) =>
          day === 4 || day === 5
            ? ("weekday" as const)
            : (row.teachingSlot ?? teachingPeriod(row)),
        ),
    ),
  ];
  const ranges = {
    minimumAge:
      rows[0]?.minimumAge == null ? null : Math.min(12, rows[0].minimumAge),
    maximumAge:
      rows[0]?.maximumAge == null ? null : Math.min(12, rows[0].maximumAge),
    minimumLevel: rows[0]?.minimumLevel ?? null,
    maximumLevel: rows[0]?.maximumLevel ?? null,
  };
  function update(
    day?: number,
    slot?: Slot,
    range: Partial<typeof ranges> = {},
  ) {
    const next = days.flatMap((item) => {
      const current = slotsFor(item.day);
      const selected =
        item.day === day && slot
          ? current.includes(slot)
            ? current.filter((value) => value !== slot)
            : [...current, slot]
          : current;
      return selected.map((teachingSlot) => ({
        weekday: item.day,
        teachingSlot,
        startsAt: "00:00",
        endsAt: "23:59",
        ...ranges,
        ...range,
      }));
    });
    setRows(next);
    onChange(next);
  }
  return (
    <section className="bg-muted/20 space-y-5 rounded-xl border p-5">
      <div>
        <h3 className="flex items-center gap-2 font-semibold">
          <CalendarDays className="text-primary size-4" /> Weekly availability
        </h3>
        <p className="text-muted-foreground mt-1 text-xs">
          Select every lesson type they can teach. AM, PM and Full day are
          independent. Applies across programs and sessions.
        </p>
      </div>
      {error ? (
        <div role="alert" className="text-destructive text-sm">
          {error}{" "}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Retry
          </Button>
        </div>
      ) : loading ? (
        <p className="text-muted-foreground text-sm">Loading availability…</p>
      ) : (
        <>
          <div className="bg-background divide-y rounded-lg border">
            {days.map(({ day, label }) => (
              <div
                key={day}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <span className="text-sm font-medium">{label}</span>
                {day === 4 || day === 5 ? (
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={slotsFor(day).includes("weekday")}
                      onCheckedChange={() => update(day, "weekday")}
                    />
                    Available
                  </label>
                ) : (
                  <div
                    className="flex flex-wrap gap-1"
                    role="group"
                    aria-label={`${label} availability`}
                  >
                    {(
                      [
                        ["am", "AM"],
                        ["pm", "PM"],
                        ["full", "Full day"],
                      ] as const
                    ).map(([value, title]) => (
                      <Button
                        type="button"
                        key={value}
                        size="sm"
                        variant={
                          slotsFor(day).includes(value) ? "default" : "outline"
                        }
                        aria-pressed={slotsFor(day).includes(value)}
                        onClick={() => update(day, value)}
                      >
                        {title}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div>
            <h4 className="flex items-center gap-2 text-sm font-semibold">
              <GraduationCap className="text-primary size-4" /> Teaching
              preferences
            </h4>
            <p className="text-muted-foreground mt-1 text-xs">
              Used to rank suggestions, not restrict eligibility. Choose
              availability first.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["Age", "Level"] as const).map((kind) => {
              const min = kind === "Age" ? "minimumAge" : "minimumLevel";
              const max = kind === "Age" ? "maximumAge" : "maximumLevel";
              const values =
                kind === "Age"
                  ? Array.from({ length: 11 }, (_, i) => i + 2)
                  : [1, 2, 3, 4, 5, 6];
              return (
                <fieldset
                  key={kind}
                  disabled={!rows.length}
                  className="space-y-2"
                >
                  <legend className="text-xs font-medium">
                    Preferred {kind.toLowerCase()} range
                  </legend>
                  <div className="flex items-center gap-2">
                    {([min, max] as Array<keyof typeof ranges>).map(
                      (field, index) => (
                        <Select
                          key={field}
                          disabled={!rows.length}
                          value={String(ranges[field] ?? "any")}
                          onValueChange={(value) => {
                            const n = value === "any" ? null : Number(value);
                            const patch: Partial<typeof ranges> = {
                              [field]: n,
                            };
                            if (
                              n !== null &&
                              field === min &&
                              ranges[max] !== null &&
                              n > ranges[max]
                            )
                              patch[max] = n;
                            if (
                              n !== null &&
                              field === max &&
                              ranges[min] !== null &&
                              n < ranges[min]
                            )
                              patch[min] = n;
                            update(undefined, undefined, patch);
                          }}
                        >
                          <SelectTrigger
                            aria-label={`${index ? "Maximum" : "Minimum"} preferred ${kind.toLowerCase()}`}
                            className="flex-1"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">
                              {index ? "Any maximum" : "Any minimum"}
                            </SelectItem>
                            {values.map((value) => (
                              <SelectItem key={value} value={String(value)}>
                                {kind === "Age"
                                  ? `Age ${value}`
                                  : `Level ${value}`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ),
                    )}
                  </div>
                </fieldset>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
