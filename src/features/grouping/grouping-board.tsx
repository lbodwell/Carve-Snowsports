import {
  AlertTriangleIcon,
  CheckIcon,
  SparklesIcon,
  Undo2Icon,
} from "lucide-react";
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

type Student = {
  id: string;
  name: string;
  level: string;
  age: number;
  note?: string;
};

type Group = {
  id: string;
  name: string;
  instructor: string;
  students: Array<Student>;
};

const initialStudents: Array<Student> = [
  { id: "avery", name: "Avery Chen", level: "Level 2", age: 8 },
  {
    id: "rowan",
    name: "Rowan Patel",
    level: "Level 2",
    age: 9,
    note: "Review support note",
  },
  { id: "mika", name: "Mika Flores", level: "Level 3", age: 10 },
];

const initialGroups: Array<Group> = [
  {
    id: "group-1",
    name: "Group 01",
    instructor: "Jordan Lee",
    students: [
      { id: "remy", name: "Remy Morgan", level: "Level 2", age: 8 },
      { id: "lina", name: "Lina Kim", level: "Level 2", age: 9 },
    ],
  },
  {
    id: "group-2",
    name: "Group 02",
    instructor: "Unassigned",
    students: [{ id: "noah", name: "Noah Green", level: "Level 3", age: 10 }],
  },
];

export function GroupingBoard() {
  const [groups, setGroups] = useState(initialGroups);
  const [unplaced, setUnplaced] = useState(initialStudents);
  const [lastMove, setLastMove] = useState<{
    groupId: string;
    student: Student;
  } | null>(null);

  const status = useMemo(
    () =>
      `${unplaced.length} unplaced · ${groups.filter((group) => group.instructor === "Unassigned").length} group needs an instructor`,
    [groups, unplaced],
  );

  function placeStudent(groupId: string, student: Student) {
    setGroups((current) =>
      current.map((group) =>
        group.id === groupId
          ? { ...group, students: [...group.students, student] }
          : group,
      ),
    );
    setUnplaced((current) =>
      current.filter((candidate) => candidate.id !== student.id),
    );
    setLastMove({ groupId, student });
  }

  function undoLastMove() {
    if (!lastMove) return;
    setGroups((current) =>
      current.map((group) =>
        group.id === lastMove.groupId
          ? {
              ...group,
              students: group.students.filter(
                (student) => student.id !== lastMove.student.id,
              ),
            }
          : group,
      ),
    );
    setUnplaced((current) => [...current, lastMove.student]);
    setLastMove(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="bg-card flex flex-col gap-4 rounded-xl border p-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-primary text-sm font-medium">
            Winter 2026 · Saturday AM
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Build lesson groups
          </h1>
          <p className="text-muted-foreground text-sm">
            Review the draft, resolve exceptions, then submit it for approval.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{status}</Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={undoLastMove}
            disabled={!lastMove}
          >
            <Undo2Icon data-icon="inline-start" />
            Undo move
          </Button>
          <Button size="sm">
            <CheckIcon data-icon="inline-start" />
            Submit for approval
          </Button>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(16rem,0.8fr)_minmax(0,2fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Needs placement</CardTitle>
            <CardDescription>
              Choose a group for each student. Keyboard and click actions are
              supported; drag-and-drop is never required.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {unplaced.length === 0 ? (
              <p className="bg-muted text-muted-foreground rounded-md p-3 text-sm">
                All students have a proposed placement.
              </p>
            ) : (
              unplaced.map((student) => (
                <StudentCard key={student.id} student={student} />
              ))
            )}
          </CardContent>
        </Card>

        <section
          className="grid gap-4 md:grid-cols-2"
          aria-label="Draft groups"
        >
          {groups.map((group) => (
            <Card key={group.id} className="min-h-72">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{group.name}</CardTitle>
                    <CardDescription>{group.instructor}</CardDescription>
                  </div>
                  <Badge
                    variant={
                      group.instructor === "Unassigned"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {group.students.length} students
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {group.students.map((student) => (
                  <StudentCard key={student.id} student={student} />
                ))}
                {unplaced.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {unplaced.map((student) => (
                      <Button
                        key={student.id}
                        variant="outline"
                        size="sm"
                        onClick={() => placeStudent(group.id, student)}
                      >
                        Place {student.name}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </section>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangleIcon aria-hidden="true" />
            Review before submitting
          </CardTitle>
          <CardDescription>
            Warnings are explained and should be resolved or accepted with an
            override reason.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="flex items-start gap-2 text-sm">
            <SparklesIcon className="mt-0.5 shrink-0" aria-hidden="true" />
            Group 02 has no lead instructor. This is allowed while drafting but
            blocks publication.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function StudentCard({ student }: { student: Student }) {
  return (
    <article className="bg-background flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{student.name}</p>
        <p className="text-muted-foreground text-xs">
          {student.level} · Age {student.age}
        </p>
      </div>
      {student.note ? (
        <Badge variant="outline" aria-label={`${student.name} needs review`}>
          Review
        </Badge>
      ) : null}
    </article>
  );
}
