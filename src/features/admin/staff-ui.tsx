import {
  AlertCircle,
  CheckCircle2,
  Inbox,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const staffCardClassName =
  "rounded-2xl border-t-4 border-t-pm-orange shadow-sm";

function StaffPageHeader({
  actions,
  description,
  eyebrow = "Staff workspace",
  icon: Icon,
  title,
  className,
}: {
  actions?: ReactNode;
  description: ReactNode;
  eyebrow?: ReactNode;
  icon?: LucideIcon;
  title: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "bg-pm-forest shadow-pm-forest/10 relative overflow-hidden rounded-3xl p-6 text-white shadow-lg sm:p-8",
        className,
      )}
    >
      <span
        className="bg-pm-orange absolute inset-x-0 top-0 h-1.5"
        aria-hidden="true"
      />
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            {Icon ? (
              <span className="bg-pm-orange flex size-10 shrink-0 items-center justify-center rounded-xl shadow-sm">
                <Icon className="size-5" aria-hidden="true" />
              </span>
            ) : null}
            <span className="text-sm font-medium text-white/80">
              Pleasant Mountain
            </span>
          </div>
          <p className="text-pm-amber mt-6 text-xs font-semibold tracking-wider uppercase">
            {eyebrow}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            {title}
          </h1>
          <div className="mt-2 max-w-3xl text-sm leading-relaxed text-white/75">
            {description}
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}

function StaffNotice({
  description,
  title,
  variant,
}: {
  description?: ReactNode;
  title?: ReactNode;
  variant: "success" | "error" | "warning";
}) {
  const Icon = variant === "success" ? CheckCircle2 : AlertCircle;
  return (
    <Alert variant={variant === "error" ? "destructive" : variant}>
      <Icon aria-hidden="true" />
      <div>
        {title ? <AlertTitle>{title}</AlertTitle> : null}
        {description ? (
          <AlertDescription>{description}</AlertDescription>
        ) : null}
      </div>
    </Alert>
  );
}

function StaffStatusBadge({ status }: { status: string | null | undefined }) {
  const normalized = status?.toLowerCase() ?? "unknown";
  const positive = [
    "active",
    "open",
    "ready",
    "ready_for_review",
    "applied",
    "accepted",
    "published",
    "approved",
    "unique",
  ].includes(normalized);
  const warning = [
    "draft",
    "pending",
    "queued",
    "processing",
    "submitted",
    "unmatched",
    "ambiguous",
  ].includes(normalized);
  return (
    <Badge
      variant="outline"
      className={cn(
        positive &&
          "border-pm-green/20 bg-pm-mist text-pm-forest dark:text-pm-amber",
        warning &&
          "border-pm-orange/30 bg-pm-orange/10 text-pm-orange-foreground",
      )}
    >
      {(status ?? "Unknown")
        .replaceAll("_", " ")
        .replace(/^\w/, (character) => character.toUpperCase())}
    </Badge>
  );
}

function StaffEmptyState({
  description,
  title,
}: {
  description: ReactNode;
  title: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-5 py-10 text-center">
      <span className="bg-pm-mist text-pm-green flex size-10 items-center justify-center rounded-full">
        <Inbox className="size-5" aria-hidden="true" />
      </span>
      <p className="font-medium">{title}</p>
      <div className="text-muted-foreground max-w-md text-sm">
        {description}
      </div>
    </div>
  );
}

export {
  StaffEmptyState,
  StaffNotice,
  StaffPageHeader,
  StaffStatusBadge,
  staffCardClassName,
};
