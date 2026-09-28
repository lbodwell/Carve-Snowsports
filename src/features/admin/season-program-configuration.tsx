import { Link, useRouter } from "@tanstack/react-router";
import { CalendarRange, Pencil, Plus, Settings2 } from "lucide-react";
import { useState } from "react";

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
import { DatePicker } from "@/components/ui/date-picker";
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
  createProgramRecord,
  createSeasonRecord,
  updateProgramRecord,
  updateSeasonRecord,
} from "@/server/functions/season-program";

type ProgramRow = {
  id: string;
  seasonId: string;
  name: string;
  description: string | null;
  status: string;
  disciplineCount: number;
  abilityLevelCount: number;
  timeSlotCount: number;
};

type SeasonRow = {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: string;
  programs: Array<ProgramRow>;
};

type SeasonProgramConfigurationProps = {
  seasons: Array<SeasonRow>;
};

const seasonStatuses = ["draft", "active", "closed"] as const;
const programStatuses = ["draft", "active", "closed"] as const;

function statusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

const emptySeasonForm = {
  name: "",
  startsOn: "",
  endsOn: "",
  status: "draft" as (typeof seasonStatuses)[number],
};

const emptyProgramForm = {
  name: "",
  description: "",
  status: "draft" as (typeof programStatuses)[number],
};

export function SeasonProgramConfiguration({
  seasons,
}: SeasonProgramConfigurationProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSeasonForm, setShowSeasonForm] = useState(false);
  const [editingSeasonId, setEditingSeasonId] = useState<string | null>(null);
  const [seasonForm, setSeasonForm] = useState(emptySeasonForm);
  const [programSeasonId, setProgramSeasonId] = useState<string | null>(null);
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const [programForm, setProgramForm] = useState(emptyProgramForm);

  function resetSeasonForm() {
    setEditingSeasonId(null);
    setSeasonForm(emptySeasonForm);
    setShowSeasonForm(false);
    setError(null);
  }

  function resetProgramForm() {
    setProgramSeasonId(null);
    setEditingProgramId(null);
    setProgramForm(emptyProgramForm);
    setError(null);
  }

  function startCreateSeason() {
    resetSeasonForm();
    setShowSeasonForm(true);
  }

  function startEditSeason(season: SeasonRow) {
    setEditingSeasonId(season.id);
    setSeasonForm({
      name: season.name,
      startsOn: season.startsOn,
      endsOn: season.endsOn,
      status: season.status as (typeof seasonStatuses)[number],
    });
    setShowSeasonForm(true);
    setError(null);
  }

  function startCreateProgram(seasonId: string) {
    resetProgramForm();
    setProgramSeasonId(seasonId);
  }

  function startEditProgram(program: ProgramRow) {
    setProgramSeasonId(program.seasonId);
    setEditingProgramId(program.id);
    setProgramForm({
      name: program.name,
      description: program.description ?? "",
      status: program.status as (typeof programStatuses)[number],
    });
    setError(null);
  }

  async function handleSeasonSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      if (editingSeasonId) {
        await updateSeasonRecord({
          data: { seasonId: editingSeasonId, ...seasonForm },
        });
      } else {
        await createSeasonRecord({ data: seasonForm });
      }
      resetSeasonForm();
      await router.invalidate();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The season could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleProgramSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!programSeasonId) return;

    setSaving(true);
    setError(null);

    try {
      if (editingProgramId) {
        await updateProgramRecord({
          data: { programId: editingProgramId, ...programForm },
        });
      } else {
        await createProgramRecord({
          data: { seasonId: programSeasonId, ...programForm },
        });
      }
      resetProgramForm();
      await router.invalidate();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The program could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Seasons & programs
          </h1>
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
            Define the operating window for each season and the programs that
            students register for. New programs start with default disciplines,
            ability levels, age bands, and time slots.
          </p>
        </div>
        <Button type="button" onClick={startCreateSeason}>
          <Plus aria-hidden />
          Add season
        </Button>
      </header>

      {showSeasonForm ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {editingSeasonId ? "Edit season" : "Create season"}
            </CardTitle>
            <CardDescription>
              Season dates define the calendar window used for lesson planning
              and registration.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSeasonSubmit} noValidate>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="season-name">Season name</FieldLabel>
                  <Input
                    id="season-name"
                    value={seasonForm.name}
                    onChange={(event) =>
                      setSeasonForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    required
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="season-starts-on">
                      Start date
                    </FieldLabel>
                    <DatePicker
                      id="season-starts-on"
                      value={seasonForm.startsOn}
                      onValueChange={(value) =>
                        setSeasonForm((current) => ({
                          ...current,
                          startsOn: value,
                        }))
                      }
                      placeholder="Choose a start date"
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="season-ends-on">End date</FieldLabel>
                    <DatePicker
                      id="season-ends-on"
                      value={seasonForm.endsOn}
                      onValueChange={(value) =>
                        setSeasonForm((current) => ({
                          ...current,
                          endsOn: value,
                        }))
                      }
                      placeholder="Choose an end date"
                      required
                    />
                  </Field>
                </div>
                {editingSeasonId ? (
                  <Field>
                    <FieldLabel htmlFor="season-status">Status</FieldLabel>
                    <Select
                      value={seasonForm.status}
                      onValueChange={(value) =>
                        setSeasonForm((current) => ({
                          ...current,
                          status: value as (typeof seasonStatuses)[number],
                        }))
                      }
                    >
                      <SelectTrigger id="season-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {seasonStatuses.map((status) => (
                          <SelectItem key={status} value={status}>
                            {statusLabel(status)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                ) : null}
                {error ? <FieldError>{error}</FieldError> : null}
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={saving}>
                    {saving
                      ? "Saving…"
                      : editingSeasonId
                        ? "Save season"
                        : "Create season"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetSeasonForm}
                  >
                    Cancel
                  </Button>
                </div>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {seasons.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>No seasons yet</CardTitle>
            <CardDescription>
              Create the first season before adding programs and opening
              registration.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        seasons.map((season) => (
          <Card key={season.id}>
            <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-col gap-2">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <CalendarRange aria-hidden />
                  {season.name}
                </CardTitle>
                <CardDescription>
                  {season.startsOn} to {season.endsOn}
                </CardDescription>
                <Badge variant="outline">{statusLabel(season.status)}</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => startEditSeason(season)}
                >
                  <Pencil aria-hidden />
                  Edit season
                </Button>
                <Button
                  type="button"
                  onClick={() => startCreateProgram(season.id)}
                >
                  <Plus aria-hidden />
                  Add program
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {programSeasonId === season.id ? (
                <form
                  onSubmit={handleProgramSubmit}
                  noValidate
                  className="bg-muted/40 rounded-lg border p-4"
                >
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor={`program-name-${season.id}`}>
                        Program name
                      </FieldLabel>
                      <Input
                        id={`program-name-${season.id}`}
                        value={programForm.name}
                        onChange={(event) =>
                          setProgramForm((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`program-description-${season.id}`}>
                        Description
                      </FieldLabel>
                      <Input
                        id={`program-description-${season.id}`}
                        value={programForm.description}
                        onChange={(event) =>
                          setProgramForm((current) => ({
                            ...current,
                            description: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    {editingProgramId ? (
                      <Field>
                        <FieldLabel htmlFor={`program-status-${season.id}`}>
                          Status
                        </FieldLabel>
                        <Select
                          value={programForm.status}
                          onValueChange={(value) =>
                            setProgramForm((current) => ({
                              ...current,
                              status: value as (typeof programStatuses)[number],
                            }))
                          }
                        >
                          <SelectTrigger id={`program-status-${season.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {programStatuses.map((status) => (
                              <SelectItem key={status} value={status}>
                                {statusLabel(status)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    ) : null}
                    {error && programSeasonId === season.id ? (
                      <FieldError>{error}</FieldError>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" disabled={saving}>
                        {saving
                          ? "Saving…"
                          : editingProgramId
                            ? "Save program"
                            : "Create program"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={resetProgramForm}
                      >
                        Cancel
                      </Button>
                    </div>
                  </FieldGroup>
                </form>
              ) : null}

              {season.programs.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No programs in this season yet.
                </p>
              ) : (
                <div className="rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Program</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Configuration</TableHead>
                        <TableHead>
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {season.programs.map((program) => (
                        <TableRow key={program.id}>
                          <TableCell>
                            <div className="font-medium">{program.name}</div>
                            {program.description ? (
                              <div className="text-muted-foreground mt-1">
                                {program.description}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {statusLabel(program.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {program.disciplineCount} disciplines ·{" "}
                            {program.abilityLevelCount} levels ·{" "}
                            {program.timeSlotCount} time slots
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button asChild variant="ghost" size="sm">
                                <Link
                                  to="/admin/programs/$programId"
                                  params={{ programId: program.id }}
                                >
                                  <Settings2 aria-hidden />
                                  Configure
                                </Link>
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => startEditProgram(program)}
                              >
                                <Pencil aria-hidden />
                                Edit
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
