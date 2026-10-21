import { Link, useRouter } from "@tanstack/react-router";
import { Search, UserPlus, UsersRound, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import type { RegistrationScheduleSummary } from "@/domain/imports/registration-schedule-summary";
import { RegistrationScheduleDetails } from "@/features/admin/registration-schedule-details";

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
import { registerStudent } from "@/server/functions/student-roster";

type StudentRow = {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  registrationId: string | null;
  registrationStatus: string | null;
  disciplineLabel: string | null;
  abilityLevelLabel: string | null;
  medicalInfo: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string;
  notes: string;
  programId: string | null;
  programName: string | null;
  seasonName: string | null;
  schedule: RegistrationScheduleSummary;
};

export function StudentRoster({ students }: { students: Array<StudentRow> }) {
  const [query, setQuery] = useState("");
  const [discipline, setDiscipline] = useState("all");
  const [level, setLevel] = useState("all");
  const [ageBand, setAgeBand] = useState("all");
  const [purchasedAgeBand, setPurchasedAgeBand] = useState("all");
  const [medical, setMedical] = useState("all");
  const [program, setProgram] = useState("all");
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
  const detailsTrigger = useRef<HTMLButtonElement | null>(null);
  const filter = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };
  const options = (values: Array<string | null>) =>
    [...new Set(values.filter((value): value is string => Boolean(value)))]
      .sort()
      .map((value) => [value, value] as [string, string]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [registeringStudentId, setRegisteringStudentId] = useState<
    string | null
  >(null);
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
            student.schedule.productDate,
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
            (program === "all" || student.programId === program) &&
            (season === "all" || student.seasonName === season) &&
            (day === "all" ||
              (student.schedule.weekday ?? "missing") === day) &&
            (session === "all" ||
              (student.schedule.session ?? "missing") === session) &&
            (cohort === "all" || student.schedule.cohort === cohort) &&
            (purchasedAgeBand === "all" ||
              student.schedule.ageBand === purchasedAgeBand) &&
            (status === "all" ||
              (student.registrationId
                ? student.registrationStatus
                : "unregistered") === status) &&
            (missing === "all" ||
              (missing === "schedule" &&
                student.schedule.status !== "Session matched") ||
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
          if (sort === "date")
            return (
              (Date.parse(a.schedule.productDate ?? "") || Infinity) -
                (Date.parse(b.schedule.productDate ?? "") || Infinity) || name
            );
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
    setProgram("all");
    setSeason("all");
    setDay("all");
    setSession("all");
    setCohort("all");
    setStatus("all");
    setMissing("all");
    setPage(1);
  }

  async function handleRegister(studentId: string) {
    setActionError(null);
    setRegisteringStudentId(studentId);
    try {
      await registerStudent({ data: { studentId } });
      await router.invalidate();
    } catch (caught) {
      setActionError(
        caught instanceof Error
          ? caught.message
          : "The student could not be registered. Please try again.",
      );
    } finally {
      setRegisteringStudentId(null);
    }
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
          <Badge variant="secondary">
            {new Set(students.map((student) => student.id)).size} students ·{" "}
            {students.filter((student) => student.registrationId).length}{" "}
            registrations
          </Badge>
          <Button asChild>
            <Link to="/admin/students/new">
              <UserPlus data-icon="inline-start" />
              Add student
            </Link>
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Student registrations</CardTitle>
          <CardDescription>
            Filter by program, lesson day, session or missing information. Open
            a registration for dates and purchase details.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="grid gap-1">
              <label htmlFor="student-search" className="text-sm font-medium">
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
                  placeholder="Name, program, session or date"
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
              label="Program"
              value={program}
              onChange={filter(setProgram)}
              options={[
                ["all", "All programs"],
                ...[
                  ...new Map(
                    students
                      .filter((row) => row.programId)
                      .map((row) => [
                        row.programId!,
                        [row.programId!, row.programName!] as [string, string],
                      ]),
                  ).values(),
                ],
              ]}
            />
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
              label="Lesson session"
              value={session}
              onChange={filter(setSession)}
              options={[
                ["all", "All sessions"],
                ...options(students.map((row) => row.schedule.session)),
                ["missing", "Session not recorded"],
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
                  ["schedule", "Session needs review"],
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
                  ["date", "Product date"],
                ]}
              />
            </div>
          </details>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>{filteredStudents.length} matching rows</span>
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Clear filters
            </Button>
          </div>
          {actionError ? (
            <p role="alert" className="text-destructive text-sm">
              {actionError}
            </p>
          ) : null}

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
                Clear filters or try another program, day or session.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border">
              <Table className="min-w-[56rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Program / season</TableHead>
                    <TableHead>Lesson day / session</TableHead>
                    <TableHead>Lesson dates</TableHead>
                    <TableHead>Registration</TableHead>
                    <TableHead>Discipline / ability</TableHead>
                    <TableHead>Next step</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((student) => {
                    const isRegistered = student.registrationId != null;
                    return (
                      <TableRow key={student.registrationId ?? student.id}>
                        <TableCell className="font-medium">
                          <button
                            type="button"
                            onClick={(event) => {
                              detailsTrigger.current = event.currentTarget;
                              setSelected(student);
                            }}
                            className="text-left underline-offset-4 hover:underline"
                            aria-label={`View registration for ${student.firstName} ${student.lastName}${student.schedule.weekday ? ` · ${student.schedule.weekday}` : ""}${student.schedule.session ? ` · ${student.schedule.session}` : ""}`}
                          >
                            {student.firstName} {student.lastName}
                          </button>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          <div>{student.programName ?? "No program"}</div>
                          <div className="text-xs">{student.seasonName}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {student.schedule.weekday ?? "Day not recorded"} ·{" "}
                            {student.schedule.session ?? "Session not recorded"}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {student.schedule.hours ?? "Hours pending"} ·{" "}
                            {student.schedule.cohort}
                          </div>
                          {student.schedule.status !== "Session matched" && (
                            <Badge variant="outline">
                              {student.schedule.status}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>
                            {student.schedule.startsOn &&
                            student.schedule.endsOn
                              ? `${student.schedule.startsOn} – ${student.schedule.endsOn}`
                              : "Calendar dates pending"}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            Product date:{" "}
                            {student.schedule.productDate ?? "Not recorded"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={isRegistered ? "secondary" : "outline"}
                          >
                            {isRegistered
                              ? statusLabel(student.registrationStatus)
                              : "Not registered"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {student.disciplineLabel ?? "Not set"}
                          {student.abilityLevelLabel
                            ? ` · ${student.abilityLevelLabel}`
                            : ""}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {isRegistered ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(event) => {
                                detailsTrigger.current = event.currentTarget;
                                setSelected(student);
                              }}
                            >
                              View details
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              disabled={registeringStudentId === student.id}
                              onClick={() => handleRegister(student.id)}
                            >
                              {registeringStudentId === student.id
                                ? "Registering…"
                                : "Register"}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <div
            className="flex flex-wrap items-center justify-between gap-3"
            aria-label="Registration pagination"
          >
            <label className="flex items-center gap-2 text-sm">
              Rows per page
              <select
                className="rounded-md border bg-white p-2"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                {[25, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-muted-foreground text-sm">
              {filteredStudents.length ? (currentPage - 1) * pageSize + 1 : 0}–
              {Math.min(currentPage * pageSize, filteredStudents.length)} of{" "}
              {filteredStudents.length} · Page {currentPage} of {pageCount}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setPage(1)}
              >
                First
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === pageCount}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === pageCount}
                onClick={() => setPage(pageCount)}
              >
                Last
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <Dialog.Root
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              detailsTrigger.current?.focus();
            }}
            className="bg-background fixed top-1/2 left-1/2 z-50 grid max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-2xl border p-6 shadow-lg"
          >
            <Dialog.Title className="text-xl font-semibold">
              {selected?.firstName} {selected?.lastName} · Registration details
            </Dialog.Title>
            <Dialog.Description className="text-muted-foreground text-sm">
              {selected?.programName ?? "No program registration"} ·{" "}
              {selected?.seasonName} ·{" "}
              {selected?.registrationStatus ?? "Not registered"}
            </Dialog.Description>
            {selected && (
              <>
                <p className="text-sm">
                  {selected.disciplineLabel ?? "Discipline not set"} ·{" "}
                  {selected.abilityLevelLabel ?? "Ability missing"} · Birthdate:{" "}
                  {selected.dateOfBirth ?? "Not recorded"}
                </p>
                <RegistrationScheduleDetails schedule={selected.schedule} />
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Guardian</dt>
                    <dd>{selected.guardianName || "Not recorded"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Guardian contact</dt>
                    <dd>
                      {selected.guardianPhone ||
                        selected.guardianEmail ||
                        "Not recorded"}
                    </dd>
                  </div>
                </dl>
                {selected.medicalInfo && (
                  <p className="text-sm">
                    Support information: {selected.medicalInfo}
                  </p>
                )}
                <div className="flex items-center justify-between gap-2">
                  <Button asChild variant="outline">
                    <Link
                      to="/admin/students/$studentId"
                      params={{ studentId: selected.id }}
                    >
                      Edit student profile
                    </Link>
                  </Button>
                  <Dialog.Close asChild>
                    <Button>Close details</Button>
                  </Dialog.Close>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function statusLabel(status: string | null) {
  if (!status) return "Active";
  return status.charAt(0).toUpperCase() + status.slice(1);
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
