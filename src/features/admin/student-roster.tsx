import { Link, useRouter } from "@tanstack/react-router";
import { Search, UserPlus, UsersRound, X } from "lucide-react";
import { useMemo, useState } from "react";

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
};

export function StudentRoster({ students }: { students: Array<StudentRow> }) {
  const [query, setQuery] = useState("");
  const [discipline, setDiscipline] = useState("all");
  const [level, setLevel] = useState("all");
  const [ageBand, setAgeBand] = useState("all");
  const [medical, setMedical] = useState("all");
  const [actionError, setActionError] = useState<string | null>(null);
  const [registeringStudentId, setRegisteringStudentId] = useState<
    string | null
  >(null);
  const router = useRouter();
  const normalizedQuery = query.trim().toLowerCase();
  const filteredStudents = useMemo(
    () =>
      students.filter((student) => {
        const searchable = [
          student.firstName,
          student.lastName,
          student.guardianName,
          student.guardianPhone,
          student.guardianEmail,
          student.medicalInfo,
          student.notes,
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
          (discipline === "all" ||
            student.disciplineLabel?.toLowerCase() === discipline) &&
          (level === "all" || student.abilityLevelLabel === level) &&
          matchesAge &&
          (medical === "all" ||
            (medical === "has" && hasMedical) ||
            (medical === "none" && !hasMedical))
        );
      }),
    [ageBand, discipline, level, medical, normalizedQuery, students],
  );

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
            Search the roster and identify students who still need an active
            program registration.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {students.length} student{students.length === 1 ? "" : "s"}
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
          <CardTitle>Roster</CardTitle>
          <CardDescription>
            New students are registered into the active program and become
            available in the grouping workspace.
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
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Name"
                  className="pl-8"
                />
                {query ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Clear student search"
                    className="absolute top-1/2 right-1 -translate-y-1/2"
                    onClick={() => setQuery("")}
                  >
                    <X />
                  </Button>
                ) : null}
              </div>
            </div>
            <FilterSelect
              label="Discipline"
              value={discipline}
              onChange={setDiscipline}
              options={[
                ["all", "All disciplines"],
                ["ski", "Ski"],
                ["snowboard", "Snowboard"],
              ]}
            />
            <FilterSelect
              label="Level"
              value={level}
              onChange={setLevel}
              options={[
                ["all", "All levels"],
                ...[1, 2, 3, 4, 5, 6].map(
                  (value) =>
                    [`Level ${value}`, `Level ${value}`] as [string, string],
                ),
              ]}
            />
            <FilterSelect
              label="Age"
              value={ageBand}
              onChange={setAgeBand}
              options={[
                ["all", "All ages"],
                ["4-6", "Ages 4–6"],
                ["7-12", "Ages 7–12"],
              ]}
            />
            <FilterSelect
              label="Medical"
              value={medical}
              onChange={setMedical}
              options={[
                ["all", "Any"],
                ["has", "Has support info"],
                ["none", "No support info"],
              ]}
            />
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
              <p className="font-medium">No students match “{query}”</p>
              <p className="text-muted-foreground text-sm">
                Clear the search or try a different name.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border">
              <Table className="min-w-[70rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Date of birth</TableHead>
                    <TableHead>Registration</TableHead>
                    <TableHead>Placement</TableHead>
                    <TableHead>Guardian</TableHead>
                    <TableHead>Medical/support</TableHead>
                    <TableHead>Next step</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStudents.map((student) => {
                    const isRegistered = student.registrationId != null;
                    return (
                      <TableRow key={student.id}>
                        <TableCell className="font-medium">
                          <Link
                            to="/admin/students/$studentId"
                            params={{ studentId: student.id }}
                            className="underline-offset-4 hover:underline"
                          >
                            {student.firstName} {student.lastName}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {student.dateOfBirth ?? "Not recorded"}
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
                          <div>{student.guardianName || "Not recorded"}</div>
                          <div className="text-xs">
                            {student.guardianPhone || student.guardianEmail}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground max-w-56">
                          <span className="line-clamp-2">
                            {student.medicalInfo || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {isRegistered ? (
                            "Ready for grouping review"
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
        </CardContent>
      </Card>
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
