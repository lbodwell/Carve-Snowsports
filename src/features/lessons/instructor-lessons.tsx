import { Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarDays } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type LessonSummary = {
  id: string;
  lessonDate: string;
  status: string;
  timeSlotLabel: string;
  groupNumber: number;
  programName: string;
  seasonName: string;
};

export function InstructorLessonSchedule({
  lessons,
}: {
  lessons: Array<LessonSummary>;
}) {
  if (lessons.length === 0) {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Your lessons</CardTitle>
          <CardDescription>
            Assigned lesson instances appear here after groups are published.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm leading-relaxed">
            No lessons are assigned to your instructor profile yet. Ask a
            coordinator to publish grouping and link your staff account to an
            instructor record.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="bg-card rounded-xl border p-5">
        <p className="text-primary text-sm font-medium">Instructor workspace</p>
        <h1 className="text-2xl font-semibold tracking-tight">Your lessons</h1>
        <p className="text-muted-foreground text-sm">
          Open a lesson to review the need-to-know roster for that date.
        </p>
      </header>

      <section className="grid gap-3">
        {lessons.map((lesson) => (
          <Card key={lesson.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">
                  Group {String(lesson.groupNumber).padStart(2, "0")}
                </CardTitle>
                <CardDescription>
                  {lesson.seasonName} · {lesson.programName}
                </CardDescription>
              </div>
              <Badge variant="outline">{lesson.status}</Badge>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <CalendarDays className="size-4" />
                {lesson.lessonDate} · {lesson.timeSlotLabel}
              </p>
              <Link
                to="/lessons/$lessonInstanceId"
                params={{ lessonInstanceId: lesson.id }}
                className="text-primary text-sm font-medium hover:underline"
              >
                View roster
              </Link>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}

export function InstructorLessonDetail({
  lesson,
  roster,
}: {
  lesson: {
    id: string;
    lessonDate: string;
    timeSlotLabel: string;
    groupNumber: number;
    programName: string;
    seasonName: string;
  };
  roster: Array<{
    id: string;
    firstName: string;
    lastName: string;
    disciplineLabel: string | null;
    abilityLevelLabel: string | null;
    hasSupportReview: boolean;
    emergencyPhone: string | null;
  }>;
}) {
  return (
    <div className="flex flex-col gap-5">
      <header className="bg-card rounded-xl border p-5">
        <p className="text-primary text-sm font-medium">
          {lesson.seasonName} · {lesson.programName}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Group {String(lesson.groupNumber).padStart(2, "0")}
        </h1>
        <p className="text-muted-foreground text-sm">
          {lesson.lessonDate} · {lesson.timeSlotLabel}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Lesson roster</CardTitle>
          <CardDescription>
            Need-to-know student context for this lesson instance.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {roster.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No students are assigned to this lesson.
            </p>
          ) : (
            roster.map((student) => (
              <div key={student.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {student.firstName} {student.lastName}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {student.disciplineLabel ?? "Discipline not set"}
                      {student.abilityLevelLabel
                        ? ` · ${student.abilityLevelLabel}`
                        : ""}
                    </p>
                  </div>
                  {student.hasSupportReview ? (
                    <Badge variant="secondary">Support review</Badge>
                  ) : null}
                </div>
                {student.emergencyPhone ? (
                  <p className="text-muted-foreground mt-2 text-sm">
                    Emergency contact: {student.emergencyPhone}
                  </p>
                ) : null}
                {student.hasSupportReview ? (
                  <p className="text-destructive mt-2 flex items-center gap-1 text-xs">
                    <AlertTriangle className="size-3.5" />
                    Review support information with a coordinator before the
                    lesson.
                  </p>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
