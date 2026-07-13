import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

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
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The configuration could not be saved.",
      );
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
  }) => Promise<void>;
  onUpdate: (data: {
    disciplineId: string;
    label: string;
    displayOrder: number;
    active: boolean;
  }) => Promise<void>;
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
              }).then(resetForm);
              return;
            }
            void onCreate({
              key: key || slugifyKey(label),
              label,
              displayOrder: order,
            }).then(resetForm);
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
                if (!editingId && !key) setKey(slugifyKey(event.target.value));
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
              <select
                id={`discipline-active-${programId}`}
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                value={active ? "active" : "inactive"}
                onChange={(event) => setActive(event.target.value === "active")}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
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
  }) => Promise<void>;
  onUpdate: (data: {
    abilityLevelId: string;
    label: string;
    numericRank: number;
    displayOrder: number;
    active: boolean;
  }) => Promise<void>;
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
              }).then(resetForm);
              return;
            }
            void onCreate({
              key: key || slugifyKey(label),
              label,
              numericRank: rank,
              displayOrder: order,
            }).then(resetForm);
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
              <select
                id={`level-active-${programId}`}
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                value={active ? "active" : "inactive"}
                onChange={(event) => setActive(event.target.value === "active")}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
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
  }) => Promise<void>;
  onUpdate: (data: {
    ageBandId: string;
    label: string;
    minimumAge: number;
    maximumAge: number;
    displayOrder: number;
    active: boolean;
  }) => Promise<void>;
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
                resetForm,
              );
              return;
            }
            void onCreate(payload).then(resetForm);
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
              <select
                id={`age-active-${programId}`}
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                value={active ? "active" : "inactive"}
                onChange={(event) => setActive(event.target.value === "active")}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
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
    displayOrder: number;
  }) => Promise<void>;
  onUpdate: (data: {
    timeSlotId: string;
    label: string;
    startsAt: string;
    endsAt: string;
    displayOrder: number;
    active: boolean;
  }) => Promise<void>;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [startsAt, setStartsAt] = useState("09:00");
  const [endsAt, setEndsAt] = useState("12:00");
  const [displayOrder, setDisplayOrder] = useState("0");
  const [active, setActive] = useState(true);

  function resetForm() {
    setShowCreate(false);
    setEditingId(null);
    setLabel("");
    setKey("");
    setStartsAt("09:00");
    setEndsAt("12:00");
    setDisplayOrder("0");
    setActive(true);
  }

  function startEdit(item: (typeof timeSlots)[number]) {
    setEditingId(item.id);
    setLabel(item.label);
    setKey(item.key);
    setStartsAt(item.startsAt);
    setEndsAt(item.endsAt);
    setDisplayOrder(String(item.displayOrder));
    setActive(item.active);
    setShowCreate(true);
  }

  return (
    <ConfigurationSection
      title="Time slots"
      description="Time slots define the local lesson windows used for grouping and scheduling."
      onAdd={() => {
        resetForm();
        setShowCreate(true);
      }}
    >
      <ConfigurationTable
        headers={["Label", "Key", "Hours", "Order", "Status", ""]}
        rows={timeSlots.map((item) => [
          item.label,
          item.key,
          `${item.startsAt}–${item.endsAt}`,
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
                displayOrder: order,
                active,
              }).then(resetForm);
              return;
            }
            void onCreate({
              key: key || slugifyKey(label),
              label,
              startsAt,
              endsAt,
              displayOrder: order,
            }).then(resetForm);
          }}
        >
          <Field>
            <FieldLabel htmlFor={`slot-label-${programId}`}>Label</FieldLabel>
            <Input
              id={`slot-label-${programId}`}
              value={label}
              onChange={(event) => {
                setLabel(event.target.value);
                if (!editingId && !key) setKey(slugifyKey(event.target.value));
              }}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`slot-key-${programId}`}>Key</FieldLabel>
            <Input
              id={`slot-key-${programId}`}
              value={key}
              onChange={(event) => setKey(event.target.value)}
              disabled={Boolean(editingId)}
              required
            />
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
              <select
                id={`slot-active-${programId}`}
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                value={active ? "active" : "inactive"}
                onChange={(event) => setActive(event.target.value === "active")}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
          ) : null}
        </ConfigurationForm>
      ) : null}
    </ConfigurationSection>
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
          <CardTitle>{title}</CardTitle>
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
    <div className="overflow-x-auto rounded-lg border">
      <table className="min-w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>
            {headers.map((header) => (
              <th
                key={header || "actions"}
                scope="col"
                className="px-4 py-3 font-medium"
              >
                {header || <span className="sr-only">Actions</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, index) => (
            <tr key={index} className="border-t">
              {cells.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-3">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
