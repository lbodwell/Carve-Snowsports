import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { RefreshButton } from "@/components/refresh-button";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createAbilityLevelRecord,
  createAgeBandRecord,
  createDisciplineRecord,
  createTimeSlotRecord,
  updateAbilityLevelRecord,
  updateAgeBandRecord,
  updateDisciplineRecord,
  updateTimeSlotRecord,
} from "@/server/functions/program-configuration";

type ConfigurationItem = {
  id: string;
  label: string;
  active: boolean;
};

type ProgramConfigurationEditorProps = {
  programId: string;
  program: {
    id: string;
    name: string;
    description: string | null;
    status: string;
  };
  season: { id: string; name: string } | null;
  disciplines: Array<ConfigurationItem & { key: string; displayOrder: number }>;
  abilityLevels: Array<
    ConfigurationItem & {
      key: string;
      numericRank: number;
      displayOrder: number;
    }
  >;
  ageBands: Array<
    ConfigurationItem & {
      minimumAge: number;
      maximumAge: number;
      displayOrder: number;
    }
  >;
  timeSlots: Array<
    ConfigurationItem & {
      key: string;
      startsAt: string;
      endsAt: string;
      startsOn: string | null;
      endsOn: string | null;
      allowedWeekdays?: Array<number>;
      excludedDates: Array<string>;
      cohort: string;
      displayOrder: number;
    }
  >;
};

function slugifyKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function statusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function ProgramConfigurationEditor({
  abilityLevels,
  ageBands,
  disciplines,
  program,
  programId,
  season,
  timeSlots,
}: ProgramConfigurationEditorProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function runMutation(action: () => Promise<unknown>) {
    setSaving(true);
    setError(null);
    try {
      await action();
      await router.invalidate();
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The configuration could not be saved.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <Button asChild variant="ghost" className="w-fit px-0">
          <Link to="/admin/seasons">
            <ArrowLeft aria-hidden />
            Back to seasons
          </Link>
        </Button>
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-sm font-medium">
            {season?.name ?? "Season"}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {program.name}
          </h1>
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
            Edit the disciplines, ability levels, age bands, and time slots used
            by registration, instructor qualification, and grouping for this
            program.
          </p>
          <Badge variant="outline">{statusLabel(program.status)}</Badge>
        </div>
      </header>

      {error ? <FieldError>{error}</FieldError> : null}

      <DisciplineSection
        programId={programId}
        disciplines={disciplines}
        saving={saving}
        onCreate={(data) =>
          runMutation(() =>
            createDisciplineRecord({ data: { programId, ...data } }),
          )
        }
        onUpdate={(data) => runMutation(() => updateDisciplineRecord({ data }))}
      />

      <AbilityLevelSection
        programId={programId}
        abilityLevels={abilityLevels}
        saving={saving}
        onCreate={(data) =>
          runMutation(() =>
            createAbilityLevelRecord({ data: { programId, ...data } }),
          )
        }
        onUpdate={(data) =>
          runMutation(() => updateAbilityLevelRecord({ data }))
        }
      />

      <AgeBandSection
        programId={programId}
        ageBands={ageBands}
        saving={saving}
        onCreate={(data) =>
          runMutation(() =>
            createAgeBandRecord({ data: { programId, ...data } }),
          )
        }
        onUpdate={(data) => runMutation(() => updateAgeBandRecord({ data }))}
      />

      <TimeSlotSection
        programId={programId}
        timeSlots={timeSlots}
        saving={saving}
        onCreate={(data) =>
          runMutation(() =>
            createTimeSlotRecord({ data: { programId, ...data } }),
          )
        }
        onUpdate={(data) => runMutation(() => updateTimeSlotRecord({ data }))}
      />
    </div>
  );
}

function DisciplineSection({
  disciplines,
  onCreate,
  onUpdate,
  programId,
  saving,
}: {
  programId: string;
  disciplines: ProgramConfigurationEditorProps["disciplines"];
  saving: boolean;
  onCreate: (data: {
    key: string;
    label: string;
    displayOrder: number;
  }) => Promise<boolean>;
  onUpdate: (data: {
    disciplineId: string;
    label: string;
    displayOrder: number;
    active: boolean;
  }) => Promise<boolean>;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [displayOrder, setDisplayOrder] = useState("0");
  const [active, setActive] = useState(true);

  function resetForm() {
    setShowCreate(false);
    setEditingId(null);
    setLabel("");
    setKey("");
    setDisplayOrder("0");
    setActive(true);
  }

  function startEdit(item: (typeof disciplines)[number]) {
    setEditingId(item.id);
    setLabel(item.label);
    setKey(item.key);
    setDisplayOrder(String(item.displayOrder));
    setActive(item.active);
    setShowCreate(true);
  }

  return (
    <ConfigurationSection
      title="Disciplines"
      description="Disciplines drive student placement, instructor qualifications, and grouping filters."
      onAdd={() => {
        resetForm();
        setShowCreate(true);
      }}
    >
      <ConfigurationTable
        headers={["Label", "Key", "Order", "Status", ""]}
        rows={disciplines.map((item) => [
          item.label,
          item.key,
          String(item.displayOrder),
          item.active ? "Active" : "Inactive",
          <Button
            key={item.id}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => startEdit(item)}
          >
            <Pencil aria-hidden />
            Edit
          </Button>,
        ])}
        emptyMessage="No disciplines configured yet."
      />
      {showCreate ? (
        <ConfigurationForm
          saving={saving}
          submitLabel={editingId ? "Save discipline" : "Add discipline"}
          onCancel={resetForm}
          onSubmit={(event) => {
            event.preventDefault();
            const order = Number(displayOrder);
            if (editingId) {
              void onUpdate({
                disciplineId: editingId,
                label,
                displayOrder: order,
                active,
              }).then((saved) => {
                if (saved) resetForm();
              });
              return;
            }
            void onCreate({
              key: key || slugifyKey(label),
              label,
              displayOrder: order,
            }).then((saved) => {
              if (saved) resetForm();
            });
          }}
        >
          <Field>
            <FieldLabel htmlFor={`discipline-label-${programId}`}>
              Label
            </FieldLabel>
            <Input
              id={`discipline-label-${programId}`}
              value={label}
              onChange={(event) => {
                setLabel(event.target.value);
                if (!editingId) setKey(slugifyKey(event.target.value));
              }}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`discipline-key-${programId}`}>Key</FieldLabel>
            <Input
              id={`discipline-key-${programId}`}
              value={key}
              onChange={(event) => setKey(event.target.value)}
              disabled={Boolean(editingId)}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`discipline-order-${programId}`}>
              Display order
            </FieldLabel>
            <Input
              id={`discipline-order-${programId}`}
              type="number"
              min={0}
              value={displayOrder}
              onChange={(event) => setDisplayOrder(event.target.value)}
              required
            />
          </Field>
          {editingId ? (
            <Field>
              <FieldLabel htmlFor={`discipline-active-${programId}`}>
                Status
              </FieldLabel>
              <ActiveSelect
                id={`discipline-active-${programId}`}
                active={active}
                onChange={setActive}
              />
            </Field>
          ) : null}
        </ConfigurationForm>
      ) : null}
    </ConfigurationSection>
  );
}

function AbilityLevelSection({
  abilityLevels,
  onCreate,
  onUpdate,
  programId,
  saving,
}: {
  programId: string;
  abilityLevels: ProgramConfigurationEditorProps["abilityLevels"];
  saving: boolean;
  onCreate: (data: {
    key: string;
    label: string;
    numericRank: number;
    displayOrder: number;
  }) => Promise<boolean>;
  onUpdate: (data: {
    abilityLevelId: string;
    label: string;
    numericRank: number;
    displayOrder: number;
    active: boolean;
  }) => Promise<boolean>;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [numericRank, setNumericRank] = useState("1");
  const [displayOrder, setDisplayOrder] = useState("0");
  const [active, setActive] = useState(true);

  function resetForm() {
    setShowCreate(false);
    setEditingId(null);
    setLabel("");
    setKey("");
    setNumericRank("1");
    setDisplayOrder("0");
    setActive(true);
  }

  function startEdit(item: (typeof abilityLevels)[number]) {
    setEditingId(item.id);
    setLabel(item.label);
    setKey(item.key);
    setNumericRank(String(item.numericRank));
    setDisplayOrder(String(item.displayOrder));
    setActive(item.active);
    setShowCreate(true);
  }

  return (
    <ConfigurationSection
      title="Ability levels"
      description="Levels are ordered by rank for grouping proximity and student placement."
      onAdd={() => {
        resetForm();
        setShowCreate(true);
      }}
    >
      <ConfigurationTable
        headers={["Label", "Key", "Rank", "Order", "Status", ""]}
        rows={abilityLevels.map((item) => [
          item.label,
          item.key,
          String(item.numericRank),
          String(item.displayOrder),
          item.active ? "Active" : "Inactive",
          <Button
            key={item.id}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => startEdit(item)}
          >
            <Pencil aria-hidden />
            Edit
          </Button>,
        ])}
        emptyMessage="No ability levels configured yet."
      />
      {showCreate ? (
        <ConfigurationForm
          saving={saving}
          submitLabel={editingId ? "Save level" : "Add level"}
          onCancel={resetForm}
          onSubmit={(event) => {
            event.preventDefault();
            const order = Number(displayOrder);
            const rank = Number(numericRank);
            if (editingId) {
              void onUpdate({
                abilityLevelId: editingId,
                label,
                numericRank: rank,
                displayOrder: order,
                active,
              }).then((saved) => {
                if (saved) resetForm();
              });
              return;
            }
            void onCreate({
              key: key || slugifyKey(label),
              label,
              numericRank: rank,
              displayOrder: order,
            }).then((saved) => {
              if (saved) resetForm();
            });
          }}
        >
          <Field>
            <FieldLabel htmlFor={`level-label-${programId}`}>Label</FieldLabel>
            <Input
              id={`level-label-${programId}`}
              value={label}
              onChange={(event) => {
                setLabel(event.target.value);
                if (!editingId && !key) setKey(slugifyKey(event.target.value));
              }}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`level-key-${programId}`}>Key</FieldLabel>
            <Input
              id={`level-key-${programId}`}
              value={key}
              onChange={(event) => setKey(event.target.value)}
              disabled={Boolean(editingId)}
              required
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`level-rank-${programId}`}>Rank</FieldLabel>
              <Input
                id={`level-rank-${programId}`}
                type="number"
                min={1}
                value={numericRank}
                onChange={(event) => setNumericRank(event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`level-order-${programId}`}>
                Display order
              </FieldLabel>
              <Input
                id={`level-order-${programId}`}
                type="number"
                min={0}
                value={displayOrder}
                onChange={(event) => setDisplayOrder(event.target.value)}
                required
              />
            </Field>
          </div>
          {editingId ? (
            <Field>
              <FieldLabel htmlFor={`level-active-${programId}`}>
                Status
              </FieldLabel>
              <ActiveSelect
                id={`level-active-${programId}`}
                active={active}
                onChange={setActive}
              />
            </Field>
          ) : null}
        </ConfigurationForm>
      ) : null}
    </ConfigurationSection>
  );
}

function AgeBandSection({
  ageBands,
  onCreate,
  onUpdate,
  programId,
  saving,
}: {
  programId: string;
  ageBands: ProgramConfigurationEditorProps["ageBands"];
  saving: boolean;
  onCreate: (data: {
    label: string;
    minimumAge: number;
    maximumAge: number;
    displayOrder: number;
  }) => Promise<boolean>;
  onUpdate: (data: {
    ageBandId: string;
    label: string;
    minimumAge: number;
    maximumAge: number;
    displayOrder: number;
    active: boolean;
  }) => Promise<boolean>;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState(null as string | null);
  const [label, setLabel] = useState("");
  const [minimumAge, setMinimumAge] = useState("4");
  const [maximumAge, setMaximumAge] = useState("6");
  const [displayOrder, setDisplayOrder] = useState("0");
  const [active, setActive] = useState(true);

  function resetForm() {
    setShowCreate(false);
    setEditingId(null);
    setLabel("");
    setMinimumAge("4");
    setMaximumAge("6");
    setDisplayOrder("0");
    setActive(true);
  }

  function startEdit(item: (typeof ageBands)[number]) {
    setEditingId(item.id);
    setLabel(item.label);
    setMinimumAge(String(item.minimumAge));
    setMaximumAge(String(item.maximumAge));
    setDisplayOrder(String(item.displayOrder));
    setActive(item.active);
    setShowCreate(true);
  }

  return (
    <ConfigurationSection
      title="Age bands"
      description="Age bands describe the program's expected participant ranges."
      onAdd={() => {
        resetForm();
        setShowCreate(true);
      }}
    >
      <ConfigurationTable
        headers={["Label", "Ages", "Order", "Status", ""]}
        rows={ageBands.map((item) => [
          item.label,
          `${item.minimumAge}–${item.maximumAge}`,
          String(item.displayOrder),
          item.active ? "Active" : "Inactive",
          <Button
            key={item.id}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => startEdit(item)}
          >
            <Pencil aria-hidden />
            Edit
          </Button>,
        ])}
        emptyMessage="No age bands configured yet."
      />
      {showCreate ? (
        <ConfigurationForm
          saving={saving}
          submitLabel={editingId ? "Save age band" : "Add age band"}
          onCancel={resetForm}
          onSubmit={(event) => {
            event.preventDefault();
            const payload = {
              label,
              minimumAge: Number(minimumAge),
              maximumAge: Number(maximumAge),
              displayOrder: Number(displayOrder),
            };
            if (editingId) {
              void onUpdate({ ageBandId: editingId, ...payload, active }).then(
                (saved) => {
                  if (saved) resetForm();
                },
              );
              return;
            }
            void onCreate(payload).then((saved) => {
              if (saved) resetForm();
            });
          }}
        >
          <Field>
            <FieldLabel htmlFor={`age-label-${programId}`}>Label</FieldLabel>
            <Input
              id={`age-label-${programId}`}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              required
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor={`age-min-${programId}`}>
                Minimum age
              </FieldLabel>
              <Input
                id={`age-min-${programId}`}
                type="number"
                min={0}
                value={minimumAge}
                onChange={(event) => setMinimumAge(event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`age-max-${programId}`}>
                Maximum age
              </FieldLabel>
              <Input
                id={`age-max-${programId}`}
                type="number"
                min={0}
                value={maximumAge}
                onChange={(event) => setMaximumAge(event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`age-order-${programId}`}>
                Display order
              </FieldLabel>
              <Input
                id={`age-order-${programId}`}
                type="number"
                min={0}
                value={displayOrder}
                onChange={(event) => setDisplayOrder(event.target.value)}
                required
              />
            </Field>
          </div>
          {editingId ? (
            <Field>
              <FieldLabel htmlFor={`age-active-${programId}`}>
                Status
              </FieldLabel>
              <ActiveSelect
                id={`age-active-${programId}`}
                active={active}
                onChange={setActive}
              />
            </Field>
          ) : null}
        </ConfigurationForm>
      ) : null}
    </ConfigurationSection>
  );
}

function TimeSlotSection({
  onCreate,
  onUpdate,
  programId,
  saving,
  timeSlots,
}: {
  programId: string;
  timeSlots: ProgramConfigurationEditorProps["timeSlots"];
  saving: boolean;
  onCreate: (data: {
    key: string;
    label: string;
    startsAt: string;
    endsAt: string;
    startsOn: string | null;
    endsOn: string | null;
    allowedWeekdays?: Array<number>;
    excludedDates: Array<string>;
    cohort: "season" | "session-1" | "session-2";
    displayOrder: number;
  }) => Promise<boolean>;
  onUpdate: (data: {
    timeSlotId: string;
    label: string;
    startsAt: string;
    endsAt: string;
    startsOn: string | null;
    endsOn: string | null;
    allowedWeekdays?: Array<number>;
    excludedDates: Array<string>;
    cohort: "season" | "session-1" | "session-2";
    displayOrder: number;
    active: boolean;
  }) => Promise<boolean>;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [startsAt, setStartsAt] = useState("09:00");
  const [endsAt, setEndsAt] = useState("12:00");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [allowedWeekdays, setAllowedWeekdays] = useState<Array<number>>([]);
  const [excludedDates, setExcludedDates] = useState("");
  const [cohort, setCohort] = useState<"season" | "session-1" | "session-2">(
    "season",
  );
  const [displayOrder, setDisplayOrder] = useState("0");
  const [active, setActive] = useState(true);

  function resetForm() {
    setShowCreate(false);
    setEditingId(null);
    setLabel("");
    setKey("");
    setStartsAt("09:00");
    setEndsAt("12:00");
    setStartsOn("");
    setEndsOn("");
    setExcludedDates("");
    setCohort("season");
    setDisplayOrder("0");
    setActive(true);
  }

  function startEdit(item: (typeof timeSlots)[number]) {
    setEditingId(item.id);
    setLabel(item.label);
    setKey(item.key);
    setStartsAt(item.startsAt);
    setEndsAt(item.endsAt);
    setStartsOn(item.startsOn ?? "");
    setEndsOn(item.endsOn ?? "");
    setAllowedWeekdays(item.allowedWeekdays ?? []);
    setExcludedDates(item.excludedDates.join(", "));
    setCohort(item.cohort as typeof cohort);
    setDisplayOrder(String(item.displayOrder));
    setActive(item.active);
    setShowCreate(true);
  }

  return (
    <ConfigurationSection
      title="Time slots"
      description="Keep seasonal cohorts separate. Weekend AM is 10–12, PM is 1–3, and Full Day is 10–3. Dates can be added later for numbered sessions."
      onAdd={() => {
        resetForm();
        setShowCreate(true);
      }}
    >
      <ConfigurationTable
        headers={["Label", "Cohort", "Hours", "Dates", "Status", ""]}
        rows={timeSlots.map((item) => [
          item.label,
          item.cohort === "session-1"
            ? "Session 1"
            : item.cohort === "session-2"
              ? "Session 2"
              : "Regular season",
          `${item.startsAt}–${item.endsAt}`,
          item.startsOn && item.endsOn
            ? `${item.startsOn}–${item.endsOn}`
            : item.cohort === "season"
              ? "Whole season"
              : "Dates pending",
          item.active ? "Active" : "Inactive",
          <Button
            key={item.id}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => startEdit(item)}
          >
            <Pencil aria-hidden />
            Edit
          </Button>,
        ])}
        emptyMessage="No time slots configured yet."
      />
      {showCreate ? (
        <ConfigurationForm
          saving={saving}
          submitLabel={editingId ? "Save time slot" : "Add time slot"}
          onCancel={resetForm}
          onSubmit={(event) => {
            event.preventDefault();
            const order = Number(displayOrder);
            if (editingId) {
              void onUpdate({
                timeSlotId: editingId,
                label,
                startsAt,
                endsAt,
                startsOn: startsOn || null,
                endsOn: endsOn || null,
                allowedWeekdays,
                excludedDates: excludedDates.split(/[\s,]+/).filter(Boolean),
                cohort,
                displayOrder: order,
                active,
              }).then((saved) => {
                if (saved) resetForm();
              });
              return;
            }
            void onCreate({
              key: key || slugifyKey(label),
              label,
              startsAt,
              endsAt,
              startsOn: startsOn || null,
              endsOn: endsOn || null,
              allowedWeekdays,
              excludedDates: excludedDates.split(/[\s,]+/).filter(Boolean),
              cohort,
              displayOrder: order,
            }).then((saved) => {
              if (saved) resetForm();
            });
          }}
        >
          <Field>
            <FieldLabel htmlFor={`slot-label-${programId}`}>Label</FieldLabel>
            <Input
              id={`slot-label-${programId}`}
              value={label}
              onChange={(event) => {
                setLabel(event.target.value);
                if (!editingId) setKey(slugifyKey(event.target.value));
              }}
              required
            />
          </Field>
          <div
            className="flex flex-wrap gap-2"
            aria-label="Standard weekend hours"
          >
            {(
              [
                ["AM", "10:00", "12:00"],
                ["PM", "13:00", "15:00"],
                ["Full Day", "10:00", "15:00"],
              ] as const
            ).map(([name, start, end]) => (
              <Button
                key={name}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setStartsAt(start);
                  setEndsAt(end);
                  if (!label) {
                    const nextLabel = `${cohort === "session-1" ? "Session 1 " : cohort === "session-2" ? "Session 2 " : ""}${name}`;
                    setLabel(nextLabel);
                    setKey(slugifyKey(nextLabel));
                  }
                }}
              >
                {name} · {start}–{end}
              </Button>
            ))}
          </div>
          <Field>
            <div className="flex flex-wrap gap-2">
              {[
                "Sunday",
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
              ].map((day, index) => (
                <label key={day}>
                  <input
                    type="checkbox"
                    checked={allowedWeekdays.includes(index)}
                    onChange={(e) =>
                      setAllowedWeekdays((previous) =>
                        e.target.checked
                          ? [...previous, index]
                          : previous.filter((value) => value !== index),
                      )
                    }
                  />{" "}
                  {day}
                </label>
              ))}
            </div>
            <FieldLabel htmlFor={`slot-cohort-${programId}`}>
              Seasonal cohort
            </FieldLabel>
            <select
              id={`slot-cohort-${programId}`}
              className="bg-background rounded-md border p-2 text-sm"
              value={cohort}
              onChange={(event) =>
                setCohort(event.target.value as typeof cohort)
              }
            >
              <option value="season">Regular season</option>
              <option value="session-1">Session 1</option>
              <option value="session-2">Session 2</option>
            </select>
            <p className="text-muted-foreground text-xs">
              Session 1 and Session 2 are different seasonal date ranges, never
              interchangeable placement choices.
            </p>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`slot-first-${programId}`}>
                First possible lesson date
              </FieldLabel>
              <Input
                id={`slot-first-${programId}`}
                type="date"
                value={startsOn}
                onChange={(event) => setStartsOn(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`slot-last-${programId}`}>
                Last possible lesson date
              </FieldLabel>
              <Input
                id={`slot-last-${programId}`}
                type="date"
                value={endsOn}
                onChange={(event) => setEndsOn(event.target.value)}
              />
            </Field>
          </div>
          <p className="text-muted-foreground text-xs">
            Leave both blank to build groups with dates pending. Regular
            sessions use the whole season; numbered sessions need dates before
            publication.
          </p>
          <Field>
            <FieldLabel htmlFor={`slot-holidays-${programId}`}>
              No-lesson dates
            </FieldLabel>
            <Input
              id={`slot-holidays-${programId}`}
              value={excludedDates}
              placeholder="2027-01-16, 2027-02-13"
              onChange={(event) => setExcludedDates(event.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Enter dates as YYYY-MM-DD, separated by commas.
            </p>
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor={`slot-start-${programId}`}>
                Starts
              </FieldLabel>
              <Input
                id={`slot-start-${programId}`}
                type="time"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`slot-end-${programId}`}>Ends</FieldLabel>
              <Input
                id={`slot-end-${programId}`}
                type="time"
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`slot-order-${programId}`}>
                Display order
              </FieldLabel>
              <Input
                id={`slot-order-${programId}`}
                type="number"
                min={0}
                value={displayOrder}
                onChange={(event) => setDisplayOrder(event.target.value)}
                required
              />
            </Field>
          </div>
          {editingId ? (
            <Field>
              <FieldLabel htmlFor={`slot-active-${programId}`}>
                Status
              </FieldLabel>
              <ActiveSelect
                id={`slot-active-${programId}`}
                active={active}
                onChange={setActive}
              />
            </Field>
          ) : null}
        </ConfigurationForm>
      ) : null}
    </ConfigurationSection>
  );
}

function ActiveSelect({
  active,
  id,
  onChange,
}: {
  active: boolean;
  id: string;
  onChange: (active: boolean) => void;
}) {
  return (
    <Select
      value={active ? "active" : "inactive"}
      onValueChange={(value) => onChange(value === "active")}
    >
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="active">Active</SelectItem>
        <SelectItem value="inactive">Inactive</SelectItem>
      </SelectContent>
    </Select>
  );
}

function ConfigurationSection({
  children,
  description,
  onAdd,
  title,
}: {
  children: ReactNode;
  description: string;
  onAdd: () => void;
  title: string;
}) {
  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <CardTitle role="heading" aria-level={2}>
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Button type="button" variant="outline" onClick={onAdd}>
          <Plus aria-hidden />
          Add
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

function ConfigurationTable({
  emptyMessage,
  headers,
  rows,
}: {
  emptyMessage: string;
  headers: Array<string>;
  rows: Array<Array<ReactNode>>;
}) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">{emptyMessage}</p>;
  }

  return (
    <div className="rounded-xl border">
      <RefreshButton />
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((header) => (
              <TableHead key={header || "actions"}>
                {header || <span className="sr-only">Actions</span>}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((cells, index) => (
            <TableRow key={index}>
              {cells.map((cell, cellIndex) => (
                <TableCell key={cellIndex}>{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ConfigurationForm({
  children,
  onCancel,
  onSubmit,
  saving,
  submitLabel,
}: {
  children: ReactNode;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  saving: boolean;
  submitLabel: string;
}) {
  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="bg-muted/40 rounded-lg border p-4"
    >
      <FieldGroup>
        {children}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : submitLabel}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
