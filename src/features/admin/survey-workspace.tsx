import { Link, useRouter } from "@tanstack/react-router";
import {
  CheckCircle2,
  ClipboardCopy,
  ClipboardList,
  Download,
  ExternalLink,
  Plus,
  TriangleAlert,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

import type { getAdminSurveyWorkspace } from "@/server/functions/surveys";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  surveyLevels,
  surveyLifts,
  surveySessions,
} from "@/domain/surveys/pre-lesson-intake";
import {
  addParentSurveyInvitation,
  generateParentSurveyInvitations,
  saveSurveyAccess,
} from "@/server/functions/surveys";

type Workspace = Awaited<ReturnType<typeof getAdminSurveyWorkspace>>;

const sessionLabels = Object.fromEntries(
  surveySessions.map((option) => [option.key, option.label]),
);
const levelLabels = Object.fromEntries(
  surveyLevels.map((option) => [option.key, option.label]),
);
const liftLabels = Object.fromEntries(
  surveyLifts.map((option) => [option.key, option.label]),
);

function downloadInvitationCsv(
  invitations: Workspace["invitations"],
  slug: string,
) {
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const csv = [
    "email,url",
    ...invitations.map(
      (invitation) => `${quote(invitation.email)},${quote(invitation.url)}`,
    ),
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slug}-survey-invitations.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatDate(value: Date | string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function SurveyWorkspace({ workspace }: { workspace: Workspace }) {
  const router = useRouter();
  const survey = workspace.survey;
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState(survey?.status ?? "draft");
  const [allowAnonymous, setAllowAnonymous] = useState(
    survey?.allowAnonymous ?? false,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!survey) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No survey configured</CardTitle>
          <CardDescription>
            Seed or create the pre-lesson survey before using this workspace.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const activeSurvey = survey;

  async function run(
    key: string,
    action: () => Promise<unknown>,
    successMessage: string,
  ) {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(successMessage);
      await router.invalidate();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The action could not be completed.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function addInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(
      "add",
      () =>
        addParentSurveyInvitation({
          data: { surveyId: activeSurvey.id, email },
        }),
      "Invitation link added.",
    );
    setEmail("");
  }

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <header className="relative overflow-hidden rounded-3xl bg-[#244617] p-7 text-white shadow-lg shadow-[#244617]/10 sm:p-8">
        <span
          className="absolute inset-x-0 top-0 h-1.5 bg-[#d88a00]"
          aria-hidden="true"
        />
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-[#d88a00] shadow-sm">
            <ClipboardList className="size-5" aria-hidden="true" />
          </span>
          <span className="text-sm font-medium text-white/80">
            Pleasant Mountain
          </span>
        </div>
        <p className="mt-7 text-sm font-medium tracking-wide text-[#f0ad35] uppercase">
          Staff workspace
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Parent surveys
        </h1>
        <p className="mt-3 max-w-3xl text-white/75">
          Issue parent-specific links and review incoming pre-lesson
          information. Responses do not change student records.
        </p>
      </header>

      {error ? (
        <div
          className="border-destructive/30 bg-destructive/5 text-destructive flex items-start gap-3 rounded-2xl border p-4 text-sm"
          role="alert"
        >
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <p>{error}</p>
        </div>
      ) : null}
      {message ? (
        <div
          className="flex items-start gap-3 rounded-2xl border border-[#315925]/20 bg-[#edf4e9] p-4 text-sm text-[#244617]"
          role="status"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>{message}</p>
        </div>
      ) : null}

      <Card className="rounded-2xl border-t-4 border-t-[#d88a00] shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">{activeSurvey.title}</CardTitle>
              <Badge className="mt-2 border-[#315925]/20 bg-[#edf4e9] text-[#244617]">
                {activeSurvey.status}
              </Badge>
            </div>
            <Button
              asChild
              className="cursor-pointer border-[#315925]/25 text-[#244617] hover:bg-[#edf4e9]"
              variant="outline"
            >
              <a
                href={activeSurvey.anonymousUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink aria-hidden="true" />
                Preview form
              </a>
            </Button>
          </div>
          <CardDescription>
            Share the anonymous link with parents. Each response asks for an
            email address to help with matching.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
            <label className="flex flex-col gap-2 text-sm font-medium">
              Status
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-full cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem className="cursor-pointer" value="draft">
                    Draft
                  </SelectItem>
                  <SelectItem className="cursor-pointer" value="open">
                    Open
                  </SelectItem>
                  <SelectItem className="cursor-pointer" value="closed">
                    Closed
                  </SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="hover:bg-muted/40 flex min-h-12 cursor-pointer items-center gap-3 self-end rounded-xl border p-3 text-sm transition has-data-[state=checked]:border-[#315925] has-data-[state=checked]:bg-[#edf4e9]">
              <Checkbox
                className="cursor-pointer border-[#315925] data-checked:bg-[#315925]"
                checked={allowAnonymous}
                onCheckedChange={(checked) =>
                  setAllowAnonymous(checked === true)
                }
              />
              Allow the shared anonymous link
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="cursor-pointer bg-[#244617] text-white hover:bg-[#315925]"
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void run(
                  "access",
                  () =>
                    saveSurveyAccess({
                      data: {
                        surveyId: activeSurvey.id,
                        status: status as "draft" | "open" | "closed",
                        allowAnonymous,
                      },
                    }),
                  "Survey access updated.",
                )
              }
            >
              Save access
            </Button>
            <Button
              className="cursor-pointer border-[#315925]/25 text-[#244617] hover:bg-[#edf4e9]"
              type="button"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(activeSurvey.anonymousUrl);
                setMessage("Anonymous link copied.");
              }}
            >
              <ClipboardCopy aria-hidden />
              Copy anonymous link
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-t-4 border-t-[#d88a00] shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">
            Optional personal invitation links
          </CardTitle>
          <CardDescription>
            Generate links from guardian emails on active registrations, or add
            an address manually.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Button
              className="cursor-pointer bg-[#244617] text-white hover:bg-[#315925]"
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void run(
                  "generate",
                  async () => {
                    const result = await generateParentSurveyInvitations({
                      data: { surveyId: activeSurvey.id },
                    });
                    setMessage(
                      `${result.createdCount} new invitation link${result.createdCount === 1 ? "" : "s"} generated.`,
                    );
                  },
                  "Invitation links generated.",
                )
              }
            >
              <UsersRound aria-hidden />
              Generate from current roster
            </Button>
            <Button
              className="cursor-pointer border-[#315925]/25 text-[#244617] hover:bg-[#edf4e9]"
              type="button"
              variant="outline"
              disabled={workspace.invitations.length === 0}
              onClick={() =>
                downloadInvitationCsv(workspace.invitations, activeSurvey.slug)
              }
            >
              <Download aria-hidden />
              Export email and link CSV
            </Button>
          </div>
          <form
            className="flex max-w-xl flex-col gap-2 sm:flex-row"
            onSubmit={addInvitation}
          >
            <Input
              className="min-h-10"
              type="email"
              required
              placeholder="parent@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Button
              className="min-h-10 cursor-pointer border-[#315925]/25 text-[#244617] hover:bg-[#edf4e9]"
              type="submit"
              variant="outline"
              disabled={busy !== null}
            >
              <Plus aria-hidden />
              Add email
            </Button>
          </form>

          {workspace.invitations.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No invitation links have been generated.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#edf4e9] hover:bg-[#edf4e9]">
                    <TableHead className="text-[#244617]">Email</TableHead>
                    <TableHead className="text-[#244617]">Opened</TableHead>
                    <TableHead className="text-[#244617]">Responses</TableHead>
                    <TableHead className="text-[#244617]">Link</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workspace.invitations.map((invitation) => (
                    <TableRow
                      className="hover:bg-[#edf4e9]/40"
                      key={invitation.id}
                    >
                      <TableCell>{invitation.email}</TableCell>
                      <TableCell>
                        {formatDate(invitation.lastOpenedAt)}
                      </TableCell>
                      <TableCell>{invitation.responseCount}</TableCell>
                      <TableCell>
                        <Button
                          className="cursor-pointer text-[#244617] hover:bg-[#edf4e9]"
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            void navigator.clipboard.writeText(invitation.url);
                            setMessage(`Link copied for ${invitation.email}.`);
                          }}
                        >
                          <ClipboardCopy aria-hidden />
                          Copy
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-t-4 border-t-[#d88a00] shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Responses</CardTitle>
          <CardDescription>
            Suggested matches use exact child name and birthdate. Review medical
            details here; nothing is applied automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {workspace.responses.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No responses have been submitted.
            </p>
          ) : (
            <Accordion type="multiple" className="flex flex-col gap-3">
              {workspace.responses.map((response) => {
                const answers = response.answers;
                return (
                  <AccordionItem
                    className="overflow-hidden rounded-xl border last:border-b data-[state=open]:border-[#315925]/30 data-[state=open]:bg-[#edf4e9]/20"
                    key={response.id}
                    value={response.id}
                  >
                    <AccordionTrigger className="px-4 py-4 hover:bg-[#edf4e9]/40 hover:no-underline">
                      <div className="flex w-full flex-wrap items-center justify-between gap-3 pr-2 text-left">
                        <div>
                          <p className="font-medium">
                            {response.childFirstName} {response.childLastName}
                          </p>
                          <p className="text-muted-foreground text-sm font-normal">
                            Born {response.childDateOfBirth} ·{" "}
                            {answers.discipline === "ski"
                              ? "Skier"
                              : "Snowboarder"}{" "}
                            · {levelLabels[answers.level]}
                          </p>
                        </div>
                        <Badge
                          className={
                            response.matchStatus === "unique"
                              ? "border-[#315925]/20 bg-[#edf4e9] text-[#244617]"
                              : "border-[#d88a00]/25 bg-[#fff6e6] text-[#925d00]"
                          }
                          variant="outline"
                        >
                          {response.matchStatus === "unique"
                            ? "Suggested match"
                            : response.matchStatus}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="bg-background/70 border-t px-4 pt-4 pb-4">
                      <div className="grid gap-4 text-sm sm:grid-cols-2">
                        <div>
                          <p className="font-medium">Parent email</p>
                          <p className="text-muted-foreground">
                            {answers.parentEmail}
                          </p>
                        </div>
                        <div>
                          <p className="font-medium">Session</p>
                          <p className="text-muted-foreground">
                            {sessionLabels[answers.session]}
                          </p>
                        </div>
                        <div>
                          <p className="font-medium">Comfortable lifts</p>
                          <p className="text-muted-foreground">
                            {answers.lifts
                              .map((lift) => liftLabels[lift])
                              .join(", ")}
                          </p>
                        </div>
                        <div>
                          <p className="font-medium">Medical concerns</p>
                          <p className="text-muted-foreground whitespace-pre-wrap">
                            {answers.medicalConcerns || "None provided"}
                          </p>
                        </div>
                        <div>
                          <p className="font-medium">Additional information</p>
                          <p className="text-muted-foreground whitespace-pre-wrap">
                            {answers.additionalInformation || "None provided"}
                          </p>
                        </div>
                        <div>
                          <p className="font-medium">Submitted</p>
                          <p className="text-muted-foreground">
                            {formatDate(response.submittedAt)}
                          </p>
                        </div>
                        {response.suggestedStudentId ? (
                          <div>
                            <p className="font-medium">Suggested student</p>
                            <Button
                              asChild
                              className="h-auto cursor-pointer justify-start p-0 text-[#315925]"
                              type="button"
                              variant="link"
                            >
                              <Link
                                to="/admin/students/$studentId"
                                params={{
                                  studentId: response.suggestedStudentId,
                                }}
                              >
                                {response.suggestedFirstName}{" "}
                                {response.suggestedLastName}
                              </Link>
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
