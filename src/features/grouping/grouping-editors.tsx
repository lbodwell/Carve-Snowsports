import { useState } from "react";
import { Search, Trash2 } from "lucide-react";
import type { Workspace } from "./persisted-grouping-board";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { instructorAvailability } from "@/domain/grouping/instructor-preferences";
import { displayTime } from "@/domain/calendar/display-time";
import { weekdayNames } from "@/domain/grouping/registration-schedule";

type Details = {
  weekday: number;
  timeSlotId: string;
  disciplineId: string;
  abilityLevelId: string | null;
  ageBandId: string | null;
  notes: string;
  instructorIds: Array<string>;
  leadInstructorId: string | null;
};
export function GroupConfiguration({
  busy,
  group,
  onDelete,
  onSave,
  readOnly,
  workspace,
}: {
  busy: boolean;
  group: Workspace["groups"][number];
  onDelete: () => void;
  onSave: (values: Details) => void;
  readOnly: boolean;
  workspace: Workspace;
}) {
  const [values, setValues] = useState<Details>({
    weekday: group.weekday,
    timeSlotId: group.timeSlotId,
    disciplineId: group.disciplineId ?? "",
    abilityLevelId: group.abilityLevelId,
    ageBandId: group.ageBandId,
    notes: group.notes ?? "",
    instructorIds: group.instructorIds,
    leadInstructorId: group.leadInstructorId,
  });
  const [query, setQuery] = useState("");
  const patch = (next: Partial<Details>) =>
    setValues((old) => ({ ...old, ...next }));
  const slot = workspace.timeSlots.find((row) => row.id === values.timeSlotId);
  const field = (
    label: string,
    value: string,
    options: Array<{ id: string; label: string }>,
    onChange: (value: string) => void,
  ) => (
    <label className="grid gap-1.5 text-xs font-medium">
      {label}
      <Select
        disabled={busy || readOnly}
        value={value || "any"}
        onValueChange={onChange}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={`Choose ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          {options.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Lesson details</h3>
        <div className="grid grid-cols-2 gap-4">
          {field(
            "Day",
            String(values.weekday),
            [
              ...new Set(
                workspace.timeSlots.flatMap((row) => row.allowedWeekdays),
              ),
            ].map((day) => ({ id: String(day), label: weekdayNames[day]! })),
            (value) =>
              patch({
                weekday: Number(value),
                timeSlotId:
                  workspace.timeSlots.find((row) =>
                    row.allowedWeekdays.includes(Number(value)),
                  )?.id ?? "",
              }),
          )}
          {field(
            "Time",
            values.timeSlotId,
            workspace.timeSlots
              .filter((row) => row.allowedWeekdays.includes(values.weekday))
              .map((row) => ({
                id: row.id,
                label: `${row.label} · ${displayTime(row.startsAt)}`,
              })),
            (timeSlotId) => patch({ timeSlotId }),
          )}
          {field(
            "Discipline",
            values.disciplineId,
            workspace.disciplines,
            (disciplineId) => patch({ disciplineId }),
          )}
          {field(
            "Level",
            values.abilityLevelId ?? "any",
            [{ id: "any", label: "Mixed levels" }, ...workspace.abilityLevels],
            (value) =>
              patch({ abilityLevelId: value === "any" ? null : value }),
          )}
          {field(
            "Age band",
            values.ageBandId ?? "any",
            [{ id: "any", label: "All ages" }, ...workspace.ageBands],
            (value) => patch({ ageBandId: value === "any" ? null : value }),
          )}
        </div>
      </section>
      <section className="space-y-3 border-t pt-5">
        <div>
          <h3 className="text-sm font-semibold">Teaching team</h3>
          <p className="text-muted-foreground mt-1 text-xs">
            Select eligible instructors, then choose one lead. All changes save
            together.
          </p>
        </div>
        <div className="relative">
          <Search className="text-muted-foreground absolute top-2.5 left-3 size-4" />
          <Input
            className="pl-9"
            placeholder="Find an instructor…"
            aria-label="Find group instructor"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="bg-muted/20 max-h-64 space-y-2 overflow-y-auto rounded-lg border p-2">
          {workspace.instructors
            .filter((row) =>
              `${row.firstName} ${row.lastName}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map((instructor) => {
              const selected = values.instructorIds.includes(instructor.id);
              const availability = slot
                ? instructorAvailability(instructor.preferences, {
                    ...slot,
                    programId: workspace.program.id,
                    weekday: values.weekday,
                  })
                : { eligible: false, reason: "Choose a session" };
              const qualified = instructor.disciplineIds.includes(
                values.disciplineId,
              );
              return (
                <div
                  key={instructor.id}
                  className="bg-background flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <label className="flex min-w-0 cursor-pointer items-center gap-3">
                    <Checkbox
                      disabled={
                        busy ||
                        readOnly ||
                        (!selected && (!availability.eligible || !qualified))
                      }
                      checked={selected}
                      onCheckedChange={(checked) =>
                        patch({
                          instructorIds: checked
                            ? [...values.instructorIds, instructor.id]
                            : values.instructorIds.filter(
                                (id) => id !== instructor.id,
                              ),
                          leadInstructorId:
                            !checked &&
                            values.leadInstructorId === instructor.id
                              ? null
                              : values.leadInstructorId,
                        })
                      }
                    />
                    <span>
                      <span className="block text-sm font-medium">
                        {instructor.firstName} {instructor.lastName}
                      </span>
                      <span className="text-muted-foreground block text-xs">
                        {qualified
                          ? availability.reason
                          : "Different discipline"}
                      </span>
                    </span>
                  </label>
                  {selected && (
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy || readOnly}
                      variant={
                        values.leadInstructorId === instructor.id
                          ? "default"
                          : "outline"
                      }
                      onClick={() => patch({ leadInstructorId: instructor.id })}
                    >
                      {values.leadInstructorId === instructor.id
                        ? "Lead"
                        : "Make lead"}
                    </Button>
                  )}
                </div>
              );
            })}
        </div>
      </section>
      <label className="grid gap-2 text-sm font-medium">
        Group notes
        <Textarea
          disabled={busy || readOnly}
          value={values.notes}
          onChange={(event) => patch({ notes: event.target.value })}
          placeholder="Group guidance or the reason for a mixed-level group"
        />
      </label>
      <div className="bg-background sticky bottom-0 flex items-center justify-between gap-3 border-t py-4">
        <Button
          variant="ghost"
          size="sm"
          disabled={busy || readOnly}
          onClick={onDelete}
        >
          <Trash2 />
          Remove group
        </Button>
        <Button
          disabled={
            busy || readOnly || !values.timeSlotId || !values.disciplineId
          }
          onClick={() => onSave(values)}
        >
          {busy ? "Saving…" : "Save group"}
        </Button>
      </div>
    </div>
  );
}
