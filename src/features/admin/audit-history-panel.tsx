import { Link } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type AuditHistoryEntry = {
  id: string;
  action: string;
  summary: string;
  actorLabel: string;
  createdAt: string;
  subjectLabel?: string;
  subjectHref?: string | null;
};

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AuditHistoryPanel({
  description,
  events,
  title,
}: {
  description: string;
  events: Array<AuditHistoryEntry>;
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No audit events have been recorded yet.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {events.map((event) => (
              <li
                key={event.id}
                className="border-b pb-3 last:border-0 last:pb-0"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    {event.subjectLabel ? (
                      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                        {event.subjectHref ? (
                          <Link
                            to={event.subjectHref}
                            className="hover:text-foreground"
                          >
                            {event.subjectLabel}
                          </Link>
                        ) : (
                          event.subjectLabel
                        )}
                      </p>
                    ) : null}
                    <p className="text-sm font-medium">{event.summary}</p>
                    <p className="text-muted-foreground text-sm">
                      {event.actorLabel}
                    </p>
                  </div>
                  <time
                    dateTime={event.createdAt}
                    className="text-muted-foreground shrink-0 text-sm"
                  >
                    {formatTimestamp(event.createdAt)}
                  </time>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
