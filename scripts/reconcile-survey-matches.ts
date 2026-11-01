import { and, eq } from "drizzle-orm";
import { refreshSurveyMatches } from "../src/application/services/survey-matching-service.server";
import { roles } from "../src/application/policies/authorization";
import { closeDatabaseConnection, db } from "../src/db/client.server";
import { organizationMemberships } from "../src/db/schema";

// Explicit identifiers prevent accidentally reconciling every school in a deployment.
const [organizationId, userId] = process.argv.slice(2);
try {
  if (!organizationId || !userId)
    throw new Error(
      "Usage: bun run scripts/reconcile-survey-matches.ts <organization-id> <staff-user-id>",
    );
  const [membership] = await db
    .select()
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.userId, userId),
      ),
    );
  const role = roles.find((item) => item === membership?.role);
  if (!role)
    throw new Error(
      "No staff membership exists for this organization and user.",
    );
  const result = await refreshSurveyMatches({ organizationId, userId, role });
  console.log(JSON.stringify(result));
} catch (error) {
  // Database errors may contain private values; only expose deliberate usage errors.
  console.error(
    error instanceof Error &&
      (error.message.startsWith("Usage:") ||
        error.message.startsWith("No staff"))
      ? error.message
      : "Survey reconciliation failed. Verify the migrated database and staff permissions.",
  );
  process.exitCode = 1;
} finally {
  await closeDatabaseConnection();
}
