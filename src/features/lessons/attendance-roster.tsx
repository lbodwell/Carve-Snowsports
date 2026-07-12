import { CheckIcon, PrinterIcon } from "lucide-react";
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

const students = [
  { id: "avery", name: "Avery Chen", support: "EpiPen flag" },
  { id: "remy", name: "Remy Morgan", support: null },
  { id: "lina", name: "Lina Kim", support: "Emergency contact confirmed" },
];

const statuses = ["present", "absent", "late", "excused"] as const;
type AttendanceStatus = (typeof statuses)[number];

export function AttendanceRoster() {
  const [attendance, setAttendance] = useState<
    Record<string, AttendanceStatus>
  >({});

  return (
    <div className="flex flex-col gap-5">
      <header className="bg-card flex flex-col gap-3 rounded-xl border p-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-primary text-sm font-medium">
            Saturday, January 10 · 9:00 AM
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Group 01 · Jordan Lee
          </h1>
          <p className="text-muted-foreground text-sm">
            Ski · Ages 7–12 · Level 2
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <PrinterIcon data-icon="inline-start" />
          Print roster
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Attendance</CardTitle>
          <CardDescription>
            Record today&apos;s status. Changes save to this dated lesson only.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {students.map((student) => (
            <article
              key={student.id}
              className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-1">
                <p className="font-medium">{student.name}</p>
                {student.support ? (
                  <Badge variant="outline">{student.support}</Badge>
                ) : null}
              </div>
              <div
                className="flex flex-wrap gap-2"
                aria-label={`Attendance for ${student.name}`}
              >
                {statuses.map((status) => (
                  <Button
                    key={status}
                    variant={
                      attendance[student.id] === status ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() =>
                      setAttendance((current) => ({
                        ...current,
                        [student.id]: status,
                      }))
                    }
                  >
                    {status}
                  </Button>
                ))}
              </div>
            </article>
          ))}
        </CardContent>
      </Card>

      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <CheckIcon aria-hidden="true" />
        Instructors only see their assigned lesson roster and approved safety
        context.
      </p>
    </div>
  );
}
