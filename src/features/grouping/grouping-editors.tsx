import { useState } from "react";
import { Save, Trash2 } from "lucide-react";
import type { Workspace } from "./persisted-grouping-board";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { weekdayNames as weekdays } from "@/domain/grouping/registration-schedule";

export function InstructorConfiguration({
  busy,
  readOnly,
  group,
  instructors,
  onSave,
}: {
  busy: boolean;
  readOnly: boolean;
  group: Workspace["groups"][number];
  instructors: Workspace["instructors"];
  onSave: (
    instructorIds: Array<string>,
    leadInstructorId: string | null,
  ) => void;
}) {
  const [selected, setSelected] = useState(group.instructorIds);
  const [lead, setLead] = useState(group.leadInstructorId ?? "");

  return (
    <fieldset className="grid gap-2" disabled={readOnly || busy}>
      <legend className="text-xs font-medium">Instructors</legend>
      <div className="flex flex-wrap gap-3">
        {instructors.map((instructor) => (
          <label
            key={instructor.id}
            className="flex cursor-pointer items-center gap-1.5 text-xs"
          >
            <Checkbox
              disabled={readOnly}
              checked={selected.includes(instructor.id)}
              onCheckedChange={(checked) => {
                const next =
                  checked === true
                    ? [...selected, instructor.id]
                    : selected.filter((id) => id !== instructor.id);
                setSelected(next);
                if (!next.includes(lead)) setLead(next[0] ?? "");
              }}
            />
            {instructor.firstName} {instructor.lastName}
          </label>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <label className="grid flex-1 gap-1 text-xs font-medium">
          Lead
          <Select
            disabled={readOnly}
            value={lead || "none"}
            onValueChange={(value) => setLead(value === "none" ? "" : value)}
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {instructors
                .filter((instructor) => selected.includes(instructor.id))
                .map((instructor) => (
                  <SelectItem key={instructor.id} value={instructor.id}>
                    {instructor.firstName} {instructor.lastName}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </label>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={busy || readOnly || (selected.length > 0 && !lead)}
          onClick={() => onSave(selected, lead || null)}
        >
          Save staff
        </Button>
      </div>
    </fieldset>
  );
}

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
  onSave: (values: {
    weekday: number;
    timeSlotId: string;
    disciplineId: string;
    abilityLevelId: string | null;
    ageBandId: string | null;
    notes: string;
  }) => void;
  readOnly: boolean;
  workspace: Workspace;
}) {
  const [disciplineId, setDisciplineId] = useState(group.disciplineId ?? "");
  const [weekday, setWeekday] = useState(group.weekday);
  const [timeSlotId, setTimeSlotId] = useState(group.timeSlotId);
  const [abilityLevelId, setAbilityLevelId] = useState(
    group.abilityLevelId ?? "",
  );
  const [ageBandId, setAgeBandId] = useState(group.ageBandId ?? "");
  const [notes, setNotes] = useState(group.notes ?? "");

  return (
    <fieldset className="grid gap-2" disabled={readOnly || busy}>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-xs font-medium">
          Day
          <Select
            disabled={readOnly}
            value={String(weekday)}
            onValueChange={(value) => setWeekday(Number(value))}
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {weekdays.map((label, value) => (
                <SelectItem key={label} value={String(value)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Time
          <Select value={timeSlotId} onValueChange={setTimeSlotId}>
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {workspace.timeSlots.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.cohort === "session-1"
                    ? "Session 1 · "
                    : item.cohort === "session-2"
                      ? "Session 2 · "
                      : ""}
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Discipline
          <Select value={disciplineId} onValueChange={setDisciplineId}>
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {workspace.disciplines.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Level
          <Select
            value={abilityLevelId || "any"}
            onValueChange={(value) =>
              setAbilityLevelId(value === "any" ? "" : value)
            }
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              {workspace.abilityLevels.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Ages
          <Select
            value={ageBandId || "any"}
            onValueChange={(value) =>
              setAgeBandId(value === "any" ? "" : value)
            }
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              {workspace.ageBands.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>
      <label className="grid gap-1 text-xs font-medium">
        Notes
        <Textarea
          className="min-h-16 text-xs"
          disabled={readOnly}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      <div className="flex justify-between gap-2">
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={busy || readOnly || !disciplineId}
          onClick={() =>
            onSave({
              weekday,
              timeSlotId,
              disciplineId,
              abilityLevelId: abilityLevelId || null,
              ageBandId: ageBandId || null,
              notes,
            })
          }
        >
          <Save data-icon="inline-start" />
          Save details
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          disabled={busy || readOnly}
          onClick={onDelete}
          aria-label="Delete group"
        >
          <Trash2 />
        </Button>
      </div>
    </fieldset>
  );
}
