import { Link, useRouter } from "@tanstack/react-router";
import { Search, UserPlus, UsersRound, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { RegistrationScheduleSummary } from "@/domain/imports/registration-schedule-summary";
import { RefreshButton } from "@/components/refresh-button";
import {
  RosterDetailsDialog,
  RosterPagination,
  RosterRow,
} from "@/features/admin/roster-ui";
import { registrationTimeLabel } from "@/domain/imports/registration-schedule-summary";

import { StudentDetailEditor } from "@/features/admin/student-detail-editor";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type StudentRow = {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  registrationId: string | null;
  registrationStatus: string | null;
  disciplineLabel: string | null;
  abilityLevelLabel: string | null;
  disciplineId: string | null;
  abilityLevelId: string | null;
  medicalInfo: string;
  surveyMedicalNotes?: Array<{
    note: string | null;
    sourceResponseId: string | null;
    sourceSubmittedAt: Date | null;
    requiresReview: boolean;
  }>;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string;
  notes: string;
  programId: string | null;
  programName: string | null;
  seasonName: string | null;
  schedule: RegistrationScheduleSummary;
};

export function StudentRoster({
  students,
  programs,
  selectedProgramId,
  onProgramChange,
  disciplines = [],
  abilityLevels = [],
}: {
  students: Array<StudentRow>;
  programs?: Array<{ id: string; name: string; seasonName: string }>;
  selectedProgramId?: string;
  onProgramChange?: (id: string) => void;
  disciplines?: Array<{ id: string; label: string }>;
  abilityLevels?: Array<{ id: string; label: string }>;
}) {
  const [query, setQuery] = useState("");
  const [discipline, setDiscipline] = useState("all");
  const [level, setLevel] = useState("all");
  const [ageBand, setAgeBand] = useState("all");
  const [purchasedAgeBand, setPurchasedAgeBand] = useState("all");
  const [medical, setMedical] = useState("all");
  const [localProgram, setProgram] = useState("");
  const program = selectedProgramId ?? localProgram;
  const programOptions = programs ?? [
    ...new Map(
      students
        .filter((row) => row.programId)
        .map((row) => [
          row.programId!,
          {
            id: row.programId!,
            name: row.programName ?? "Program",
            seasonName: row.seasonName ?? "",
          },
        ]),
    ).values(),
  ];
  const [season, setSeason] = useState("all");
  const [day, setDay] = useState("all");
  const [session, setSession] = useState("all");
  const [cohort, setCohort] = useState("all");
  const [status, setStatus] = useState("all");
  const [missing, setMissing] = useState("all");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<StudentRow | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const detailsTrigger = useRef<HTMLElement | null>(null);
  const filter = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };
  const options = (values: Array<string | null>) =>
    [...new Set(values.filter((value): value is string => Boolean(value)))]
      .sort()
      .map((value) => [value, value] as [string, string]);

  const router = useRouter();
  const normalizedQuery = query.trim().toLowerCase();
  const filteredStudents = useMemo(
    () =>
      students
        .filter((student) => {
          const searchable = [
            student.firstName,
            student.lastName,
            student.guardianName,
            student.guardianPhone,
            student.guardianEmail,
            student.medicalInfo,
            student.notes,
            student.programName,
            student.seasonName,
            student.schedule.weekday,
            student.schedule.session,
            student.schedule.hours,
            student.schedule.product,
          ]
            .join(" ")
            .toLowerCase();
          const age = ageFromDateOfBirth(student.dateOfBirth);
          const matchesAge =
            ageBand === "all" ||
            (ageBand === "4-6" && age !== null && age >= 4 && age <= 6) ||
            (ageBand === "7-12" && age !== null && age >= 7 && age <= 12);
          const hasMedical = student.medicalInfo.trim() !== "";
          return (
            searchable.includes(normalizedQuery) &&
            Boolean(program) &&
            student.programId === program &&
            (season === "all" || student.seasonName === season) &&
            (day === "all" ||
              (student.schedule.weekday ?? "missing") === day) &&
            (session === "all" ||
              registrationTimeLabel(student.schedule) === session) &&
            (cohort === "all" || student.schedule.cohort === cohort) &&
            (purchasedAgeBand === "all" ||
              student.schedule.ageBand === purchasedAgeBand) &&
            (status === "all" ||
              (student.registrationId
                ? student.registrationStatus
                : "unregistered") === status) &&
            (missing === "all" ||
              (missing === "schedule" &&
                student.schedule.status !== "Time matched") ||
              (missing === "ability" && !student.abilityLevelLabel) ||
              (missing === "birthdate" && !student.dateOfBirth)) &&
            (discipline === "all" || student.disciplineLabel === discipline) &&
            (level === "all" || student.abilityLevelLabel === level) &&
            matchesAge &&
            (medical === "all" ||
              (medical === "has" && hasMedical) ||
              (medical === "none" && !hasMedical))
          );
        })
        .sort((a, b) => {
          const name = `${a.lastName} ${a.firstName}`.localeCompare(
            `${b.lastName} ${b.firstName}`,
          );
          if (sort === "day") {
            const days = [
              "Sunday",
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
            ];
            const rank = (row: StudentRow) =>
              row.schedule.weekday ? days.indexOf(row.schedule.weekday) : 7;
            return (
              rank(a) - rank(b) ||
              (a.schedule.hours ?? "").localeCompare(b.schedule.hours ?? "") ||
              name
            );
          }
          return (
            name ||
            (a.programName ?? "").localeCompare(b.programName ?? "") ||
            (a.registrationId ?? a.id).localeCompare(b.registrationId ?? b.id)
          );
        }),
    [
      ageBand,
      purchasedAgeBand,
      discipline,
      level,
      medical,
      normalizedQuery,
      students,
      program,
      season,
      day,
      session,
      cohort,
      status,
      missing,
      sort,
    ],
  );
  const pageCount = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const matchingRegistrations = filteredStudents.filter(
    (student) => student.registrationId,
  ).length;
  const matchingStudents = new Set(
    filteredStudents.map((student) => student.id),
  ).size;
  const currentPage = Math.min(page, pageCount);
  const pageRows = filteredStudents.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  function resetFilters() {
    setQuery("");
    setDiscipline("all");
    setLevel("all");
    setAgeBand("all");
    setPurchasedAgeBand("all");
    setMedical("all");
    setSeason("all");
    setDay("all");
    setSession("all");
    setCohort("all");
    setStatus("all");
    setMissing("all");
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-sm font-medium">
            Season roster
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Students</h1>
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
            See who is signed up, which program they purchased, and when they
            attend. Each signup appears separately, including students with
            multiple registrations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {program && (
            <Badge variant="secondary">
              {new Set(students.map((student) => student.id)).size} students ·{" "}
              {students.filter((student) => student.registrationId).length}{" "}
              registrations
            </Badge>
          )}
          {program && (
            <Button asChild>
              <Link to="/admin/students/new" search={{ programId: program }}>
                <UserPlus data-icon="inline-start" />
                Add student
              </Link>
            </Button>
          )}
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Student registrations</CardTitle>
          <CardDescription>
            Filter by program, lesson day, time or missing information. Open a
            registration to review the lesson schedule.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid max-w-lg gap-2 text-sm font-medium">
            <label htmlFor="registration-program">Program</label>
            <select
              id="registration-program"
              className="rounded-md border bg-white p-2"
              required
              value={program}
              onChange={(event) => {
                setProgram(event.target.value);
                onProgramChange?.(event.target.value);
                setPage(1);
                resetFilters();
              }}
            >
              <option value="">Choose a program…</option>
              {programOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.seasonName} · {option.name}
                </option>
              ))}
            </select>
          </div>
          {program ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="grid gap-1">
                  <label
                    htmlFor="student-search"
                    className="text-sm font-medium"
                  >
                    Search students
                  </label>
                  <div className="relative">
                    <Search
                      aria-hidden
                      className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
                    />
                    <Input
                      id="student-search"
                      value={query}
                      onChange={(event) => filter(setQuery)(event.target.value)}
                      placeholder="Name, program, day or time"
                      className="pl-8"
                    />
                    {query ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Clear student search"
                        className="absolute top-1/2 right-1 -translate-y-1/2"
                        onClick={() => filter(setQuery)("")}
                      >
                        <X />
                      </Button>
                    ) : null}
                  </div>
                </div>
                <FilterSelect
                  label="Lesson day"
                  value={day}
                  onChange={filter(setDay)}
                  options={[
                    ["all", "All days"],
                    ...options(students.map((row) => row.schedule.weekday)),
                    ["missing", "Day not recorded"],
                  ]}
                />
                <FilterSelect
                  label="Time"
                  value={session}
                  onChange={filter(setSession)}
                  options={[
                    ["all", "All times"],
                    ...options(
                      students.map((row) =>
                        registrationTimeLabel(row.schedule),
                      ),
                    ),
                  ]}
                />
                <FilterSelect
                  label="Registration status"
                  value={status}
                  onChange={filter(setStatus)}
                  options={[
                    ["all", "All statuses"],
                    ...options(students.map((row) => row.registrationStatus)),
                    ["unregistered", "Not registered"],
                  ]}
                />
              </div>
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  More filters
                </summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <FilterSelect
                    label="Discipline"
                    value={discipline}
                    onChange={filter(setDiscipline)}
                    options={[
                      ["all", "All disciplines"],
                      ...options(
                        students.map((student) => student.disciplineLabel),
                      ),
                    ]}
                  />
                  <FilterSelect
                    label="Level"
                    value={level}
                    onChange={filter(setLevel)}
                    options={[
                      ["all", "All levels"],
                      ...options(
                        students.map((student) => student.abilityLevelLabel),
                      ),
                    ]}
                  />
                  <FilterSelect
                    label="Age from birthdate"
                    value={ageBand}
                    onChange={filter(setAgeBand)}
                    options={[
                      ["all", "All ages"],
                      ["4-6", "Ages 4–6"],
                      ["7-12", "Ages 7–12"],
                    ]}
                  />
                  <FilterSelect
                    label="Purchased age band"
                    value={purchasedAgeBand}
                    onChange={filter(setPurchasedAgeBand)}
                    options={[
                      ["all", "All purchased age bands"],
                      ...options(students.map((row) => row.schedule.ageBand)),
                    ]}
                  />
                  <FilterSelect
                    label="Medical"
                    value={medical}
                    onChange={filter(setMedical)}
                    options={[
                      ["all", "Any"],
                      ["has", "Has support info"],
                      ["none", "No support info"],
                    ]}
                  />
                  <FilterSelect
                    label="Season"
                    value={season}
                    onChange={filter(setSeason)}
                    options={[
                      ["all", "All seasons"],
                      ...options(students.map((row) => row.seasonName)),
                    ]}
                  />
                  <FilterSelect
                    label="Seasonal cohort"
                    value={cohort}
                    onChange={filter(setCohort)}
                    options={[
                      ["all", "All cohorts"],
                      ...options(students.map((row) => row.schedule.cohort)),
                    ]}
                  />
                  <FilterSelect
                    label="Needs information"
                    value={missing}
                    onChange={filter(setMissing)}
                    options={[
                      ["all", "Any"],
                      ["schedule", "Time needs review"],
                      ["ability", "Ability missing"],
                      ["birthdate", "Birthdate missing"],
                    ]}
                  />
                  <FilterSelect
                    label="Sort by"
                    value={sort}
                    onChange={filter(setSort)}
                    options={[
                      ["name", "Student name"],
                      ["day", "Lesson day and time"],
                    ]}
                  />
                </div>
              </details>
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span role="status">
                  {matchingRegistrations} matching registration
                  {matchingRegistrations === 1 ? "" : "s"} · {matchingStudents}{" "}
                  student{matchingStudents === 1 ? "" : "s"}
                </span>
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  Clear filters
                </Button>
              </div>

              {filteredStudents.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center">
                  <UsersRound
                    aria-hidden
                    className="text-muted-foreground size-5"
                  />
                  <p className="font-medium">
                    No registrations match these filters
                  </p>
                  <p className="text-muted-foreground text-sm">
                    Clear filters or try another program, day or time.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border">
                  <div className="flex justify-end border-b px-4 py-3">
                    <RefreshButton />
                  </div>
                  <Table className="min-w-[40rem]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Day</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Level</TableHead>
                        <TableHead>Age</TableHead>
                        <TableHead>Discipline</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((student) => (
                        <RosterRow
                          key={student.registrationId ?? student.id}
                          aria-label={`Edit registration for ${student.firstName} ${student.lastName} · ${student.schedule.weekday ?? ""} · ${registrationTimeLabel(student.schedule)}`}
                          onOpen={(element) => {
                            detailsTrigger.current = element;
                            setSelected(student);
                          }}
                        >
                          <TableCell className="font-medium">
                            {student.firstName} {student.lastName}
                            {student.registrationStatus !== "active" && (
                              <Badge variant="outline">
                                {student.registrationStatus}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {student.schedule.weekday ?? ""}
                          </TableCell>
                          <TableCell>
                            {registrationTimeLabel(student.schedule)}
                          </TableCell>
                          <TableCell className="font-medium">
                            {student.abilityLevelLabel ?? "Not recorded"}
                          </TableCell>
                          <TableCell>
                            {ageFromDateOfBirth(student.dateOfBirth) ?? ""}
                          </TableCell>
                          <TableCell>
                            {student.disciplineLabel ?? "Not recorded"}
                          </TableCell>
                        </RosterRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <RosterPagination
                total={filteredStudents.length}
                page={currentPage}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            </>
          ) : (
            <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm">
              Choose a program to view its registrations.
            </div>
          )}
        </CardContent>
      </Card>
      <RosterDetailsDialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open && !editorBusy) setSelected(null);
        }}
        restoreFocusTo={detailsTrigger}
        title={`${selected?.firstName ?? ""} ${selected?.lastName ?? ""}`}
        description={`${selected?.programName ?? ""} · ${selected?.seasonName ?? ""}`}
      >
        {selected && (
          <>
            <dl className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Day</dt>
                <dd>{selected.schedule.weekday}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Time</dt>
                <dd>{registrationTimeLabel(selected.schedule)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Age</dt>
                <dd>{ageFromDateOfBirth(selected.dateOfBirth) ?? ""}</dd>
              </div>
            </dl>
            <StudentDetailEditor
              key={selected.registrationId ?? selected.id}
              embedded
              onBusyChange={setEditorBusy}
              student={selected}
              disciplines={disciplines}
              abilityLevels={abilityLevels}
              programName={selected.programName}
              onCancel={() => setSelected(null)}
              onSaved={async () => {
                await router.invalidate();
                setSelected(null);
              }}
              onArchived={() => {
                setSelected(null);
                void router.invalidate();
              }}
            />
          </>
        )}
      </RosterDetailsDialog>
    </div>
  );
}

function ageFromDateOfBirth(dateOfBirth: string | null) {
  if (!dateOfBirth) return null;
  const birth = new Date(`${dateOfBirth}T00:00:00`);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  ) {
    age -= 1;
  }
  return age;
}

function FilterSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([optionValue, optionLabel]) => (
            <SelectItem key={optionValue} value={optionValue}>
              {optionLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
