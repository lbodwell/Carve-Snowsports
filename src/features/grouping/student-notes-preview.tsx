import { useId } from "react";
import type { MouseEvent } from "react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

type NotesStudent = {
  firstName: string;
  lastName: string;
  placementNotes: string;
  medicalNotes: string;
  survey?: { placementNotes: string } | null;
};

export function StudentNotesContent({ student }: { student: NotesStudent }) {
  return (
    <div className="space-y-4 text-sm">
      {student.placementNotes && (
        <section>
          <h3 className="mb-1 font-semibold">Placement</h3>
          <p className="whitespace-pre-wrap">{student.placementNotes}</p>
        </section>
      )}
      {student.survey?.placementNotes && (
        <section>
          <h3 className="mb-1 font-semibold">Survey guidance</h3>
          <p className="whitespace-pre-wrap">{student.survey.placementNotes}</p>
        </section>
      )}
      {student.medicalNotes && (
        <section>
          <h3 className="mb-1 font-semibold">Medical & support</h3>
          <p className="whitespace-pre-wrap">{student.medicalNotes}</p>
        </section>
      )}
    </div>
  );
}

export function StudentNotesPreview({
  student,
  compact,
  open,
  disabled,
  onOpenChange,
  onRead,
}: {
  student: NotesStudent;
  compact: boolean;
  open: boolean;
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onRead: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const previewId = useId();
  return (
    <HoverCard
      open={open}
      onOpenChange={onOpenChange}
      openDelay={250}
      closeDelay={0}
    >
      <HoverCardTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`View notes for ${student.firstName} ${student.lastName}`}
          aria-describedby={open ? previewId : undefined}
          onFocus={(event) => event.preventDefault()}
          onPointerLeave={() => onOpenChange(false)}
          onClick={(event) => {
            event.stopPropagation();
            onOpenChange(false);
            onRead(event);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              onOpenChange(false);
            }
          }}
          className={cn(
            "focus-visible:outline-pm-green block w-full cursor-pointer rounded-b-[inherit] border-t border-amber-200/60 bg-amber-50 p-2 text-left text-xs text-amber-950 focus-visible:outline-2 focus-visible:outline-offset-2",
            compact && "px-1.5 py-1",
          )}
        >
          {(student.placementNotes || student.survey?.placementNotes) && (
            <span className={compact ? "line-clamp-1" : "line-clamp-2"}>
              <strong>Placement · </strong>
              {student.placementNotes || student.survey?.placementNotes}
            </span>
          )}
          {student.medicalNotes && (
            <span className={compact ? "line-clamp-1" : "mt-1 line-clamp-2"}>
              <strong>Medical · </strong>
              {student.medicalNotes}
            </span>
          )}
          <span
            className={
              compact ? "sr-only" : "mt-1 block text-[10px] text-amber-800"
            }
          >
            Hover to preview · Click to read all notes
          </span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        id={previewId}
        role="tooltip"
        aria-label={`${student.firstName} ${student.lastName} notes preview`}
        side="right"
        align="start"
        sideOffset={10}
        collisionPadding={16}
        className="pointer-events-none max-h-none overflow-hidden"
      >
        <p className="mb-3 font-semibold">
          {student.firstName} {student.lastName} · Student notes
        </p>
        <div className="max-h-56 overflow-hidden">
          <StudentNotesContent student={student} />
        </div>
        <p className="text-muted-foreground mt-3 border-t pt-2 text-xs">
          Click the notes strip to read all notes.
        </p>
      </HoverCardContent>
    </HoverCard>
  );
}
