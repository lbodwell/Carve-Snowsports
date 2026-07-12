import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const createdAt = timestamp("created_at", { withTimezone: true })
  .defaultNow()
  .notNull();
const updatedAt = timestamp("updated_at", { withTimezone: true })
  .defaultNow()
  .notNull();

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    timezone: varchar("timezone", { length: 100 }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex("organizations_name_unique").on(table.name)],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: varchar("account_id", { length: 255 }).notNull(),
    providerId: varchar("provider_id", { length: 255 }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("accounts_provider_account_unique").on(
      table.providerId,
      table.accountId,
    ),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    createdAt,
    updatedAt,
    ipAddress: varchar("ip_address", { length: 255 }),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("sessions_token_unique").on(table.token)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    identifier: varchar("identifier", { length: 320 }).notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [index("verifications_identifier_index").on(table.identifier)],
);

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 32 }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.userId] }),
    check(
      "organization_memberships_role_check",
      sql`${table.role} in ('admin', 'coordinator', 'instructor')`,
    ),
  ],
);

export const seasons = pgTable(
  "seasons",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    status: varchar("status", { length: 32 }).default("draft").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    version: integer("version").default(1).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("seasons_org_name_unique").on(table.organizationId, table.name),
    index("seasons_org_active_index").on(
      table.organizationId,
      table.archivedAt,
    ),
    check(
      "seasons_date_range_check",
      sql`${table.endsOn} >= ${table.startsOn}`,
    ),
  ],
);

export const programs = pgTable(
  "programs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 32 }).default("draft").notNull(),
    version: integer("version").default(1).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("programs_season_name_unique").on(table.seasonId, table.name),
  ],
);

export const disciplines = pgTable(
  "disciplines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 64 }).notNull(),
    label: varchar("label", { length: 100 }).notNull(),
    displayOrder: integer("display_order").default(0).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("disciplines_program_key_unique").on(
      table.programId,
      table.key,
    ),
  ],
);

export const abilityLevels = pgTable(
  "ability_levels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 64 }).notNull(),
    label: varchar("label", { length: 100 }).notNull(),
    numericRank: integer("numeric_rank").notNull(),
    displayOrder: integer("display_order").default(0).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("ability_levels_program_key_unique").on(
      table.programId,
      table.key,
    ),
    uniqueIndex("ability_levels_program_rank_unique").on(
      table.programId,
      table.numericRank,
    ),
  ],
);

export const ageBands = pgTable(
  "age_bands",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 100 }).notNull(),
    minimumAge: integer("minimum_age").notNull(),
    maximumAge: integer("maximum_age").notNull(),
    displayOrder: integer("display_order").default(0).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "age_bands_range_check",
      sql`${table.maximumAge} >= ${table.minimumAge} and ${table.minimumAge} >= 0`,
    ),
  ],
);

export const timeSlots = pgTable(
  "time_slots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 64 }).notNull(),
    label: varchar("label", { length: 100 }).notNull(),
    startsAt: time("starts_at").notNull(),
    endsAt: time("ends_at").notNull(),
    displayOrder: integer("display_order").default(0).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("time_slots_program_key_unique").on(table.programId, table.key),
    check("time_slots_range_check", sql`${table.endsAt} > ${table.startsAt}`),
  ],
);

export const people = pgTable(
  "people",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    dateOfBirth: date("date_of_birth"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("people_org_name_index").on(
      table.organizationId,
      table.lastName,
      table.firstName,
    ),
  ],
);

export const students = pgTable("students", {
  personId: uuid("person_id")
    .primaryKey()
    .references(() => people.id, { onDelete: "cascade" }),
  createdAt,
  updatedAt,
});

export const instructors = pgTable("instructors", {
  personId: uuid("person_id")
    .primaryKey()
    .references(() => people.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt,
  updatedAt,
});

export const contactMethods = pgTable(
  "contact_methods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 32 }).notNull(),
    value: varchar("value", { length: 500 }).notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "contact_methods_kind_check",
      sql`${table.kind} in ('email', 'phone')`,
    ),
    index("contact_methods_person_index").on(table.personId),
  ],
);

export const studentGuardians = pgTable(
  "student_guardians",
  {
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.personId, { onDelete: "cascade" }),
    guardianId: uuid("guardian_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    relationship: varchar("relationship", { length: 100 }),
    isEmergencyContact: boolean("is_emergency_contact")
      .default(false)
      .notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [primaryKey({ columns: [table.studentId, table.guardianId] })],
);

export const supportRecords = pgTable(
  "support_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.personId, { onDelete: "cascade" }),
    category: varchar("category", { length: 32 }).notNull(),
    requiresReview: boolean("requires_review").default(true).notNull(),
    restrictedNote: text("restricted_note"),
    active: boolean("active").default(true).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "support_records_category_check",
      sql`${table.category} in ('medication', 'food_allergy', 'drug_allergy', 'special_condition')`,
    ),
    index("support_records_student_active_index").on(
      table.studentId,
      table.active,
    ),
  ],
);

export const instructorQualifications = pgTable(
  "instructor_qualifications",
  {
    instructorId: uuid("instructor_id")
      .notNull()
      .references(() => instructors.personId, { onDelete: "cascade" }),
    disciplineId: uuid("discipline_id")
      .notNull()
      .references(() => disciplines.id, { onDelete: "cascade" }),
    abilityLevelId: uuid("ability_level_id").references(
      () => abilityLevels.id,
      {
        onDelete: "set null",
      },
    ),
    createdAt,
    updatedAt,
  },
  (table) => [
    primaryKey({
      columns: [table.instructorId, table.disciplineId, table.abilityLevelId],
    }),
  ],
);

export const registrations = pgTable(
  "registrations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.personId, { onDelete: "restrict" }),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "restrict" }),
    disciplineId: uuid("discipline_id").references(() => disciplines.id, {
      onDelete: "set null",
    }),
    abilityLevelId: uuid("ability_level_id").references(
      () => abilityLevels.id,
      {
        onDelete: "set null",
      },
    ),
    status: varchar("status", { length: 32 }).default("active").notNull(),
    sourceSnapshot: jsonb("source_snapshot").$type<Record<string, unknown>>(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    version: integer("version").default(1).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("registrations_program_active_index").on(
      table.programId,
      table.status,
      table.archivedAt,
    ),
    index("registrations_student_index").on(table.studentId),
  ],
);

export const externalIdentities = pgTable(
  "external_identities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    entityType: varchar("entity_type", { length: 32 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    sourceSystem: varchar("source_system", { length: 100 }).notNull(),
    externalId: varchar("external_id", { length: 500 }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("external_identities_unique").on(
      table.organizationId,
      table.sourceSystem,
      table.entityType,
      table.externalId,
    ),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    action: varchar("action", { length: 100 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    createdAt,
  },
  (table) => [
    index("audit_events_entity_index").on(table.entityType, table.entityId),
  ],
);

export const seasonGroups = pgTable(
  "season_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    groupNumber: integer("group_number").notNull(),
    status: varchar("status", { length: 32 }).default("published").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("season_groups_number_unique").on(
      table.organizationId,
      table.seasonId,
      table.programId,
      table.groupNumber,
    ),
  ],
);

export const groupRevisions = pgTable(
  "group_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    seasonGroupId: uuid("season_group_id")
      .notNull()
      .references(() => seasonGroups.id, { onDelete: "cascade" }),
    disciplineId: uuid("discipline_id").references(() => disciplines.id, {
      onDelete: "set null",
    }),
    abilityLevelId: uuid("ability_level_id").references(
      () => abilityLevels.id,
      {
        onDelete: "set null",
      },
    ),
    ageBandId: uuid("age_band_id").references(() => ageBands.id, {
      onDelete: "set null",
    }),
    leadInstructorId: uuid("lead_instructor_id").references(
      () => instructors.personId,
      {
        onDelete: "restrict",
      },
    ),
    effectiveFrom: date("effective_from").notNull(),
    effectiveUntil: date("effective_until"),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("group_revisions_group_effective_index").on(
      table.seasonGroupId,
      table.effectiveFrom,
    ),
    check(
      "group_revisions_effective_range_check",
      sql`${table.effectiveUntil} is null or ${table.effectiveUntil} >= ${table.effectiveFrom}`,
    ),
  ],
);

export const groupRecurrences = pgTable(
  "group_recurrences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupRevisionId: uuid("group_revision_id")
      .notNull()
      .references(() => groupRevisions.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    timeSlotId: uuid("time_slot_id")
      .notNull()
      .references(() => timeSlots.id, { onDelete: "restrict" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("group_recurrences_unique").on(
      table.groupRevisionId,
      table.weekday,
      table.timeSlotId,
    ),
    check(
      "group_recurrences_weekday_check",
      sql`${table.weekday} between 0 and 6`,
    ),
  ],
);

export const lessonInstances = pgTable(
  "lesson_instances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupRevisionId: uuid("group_revision_id")
      .notNull()
      .references(() => groupRevisions.id, { onDelete: "restrict" }),
    lessonDate: date("lesson_date").notNull(),
    timeSlotId: uuid("time_slot_id")
      .notNull()
      .references(() => timeSlots.id, { onDelete: "restrict" }),
    status: varchar("status", { length: 32 }).default("scheduled").notNull(),
    notes: text("notes"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("lesson_instances_revision_date_slot_unique").on(
      table.groupRevisionId,
      table.lessonDate,
      table.timeSlotId,
    ),
    index("lesson_instances_date_index").on(table.lessonDate, table.timeSlotId),
  ],
);

export const lessonAttendance = pgTable(
  "lesson_attendance",
  {
    lessonInstanceId: uuid("lesson_instance_id")
      .notNull()
      .references(() => lessonInstances.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.personId, { onDelete: "restrict" }),
    status: varchar("status", { length: 32 }).notNull(),
    note: text("note"),
    recordedBy: uuid("recorded_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    primaryKey({ columns: [table.lessonInstanceId, table.studentId] }),
    check(
      "lesson_attendance_status_check",
      sql`${table.status} in ('present', 'absent', 'late', 'excused')`,
    ),
  ],
);

export const groupingDrafts = pgTable(
  "grouping_drafts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 32 }).default("editing").notNull(),
    ruleSetVersion: integer("rule_set_version").notNull(),
    version: integer("version").default(1).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("grouping_drafts_program_status_index").on(
      table.programId,
      table.status,
    ),
  ],
);

export const groupingDraftGroups = pgTable(
  "grouping_draft_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => groupingDrafts.id, { onDelete: "cascade" }),
    disciplineId: uuid("discipline_id").references(() => disciplines.id, {
      onDelete: "set null",
    }),
    ageBandId: uuid("age_band_id").references(() => ageBands.id, {
      onDelete: "set null",
    }),
    abilityLevelId: uuid("ability_level_id").references(
      () => abilityLevels.id,
      {
        onDelete: "set null",
      },
    ),
    leadInstructorId: uuid("lead_instructor_id").references(
      () => instructors.personId,
      {
        onDelete: "set null",
      },
    ),
    createdAt,
    updatedAt,
  },
  (table) => [index("grouping_draft_groups_draft_index").on(table.draftId)],
);

export const groupingDraftAssignments = pgTable(
  "grouping_draft_assignments",
  {
    draftGroupId: uuid("draft_group_id")
      .notNull()
      .references(() => groupingDraftGroups.id, { onDelete: "cascade" }),
    registrationId: uuid("registration_id")
      .notNull()
      .references(() => registrations.id, { onDelete: "cascade" }),
    overrideReason: text("override_reason"),
    createdAt,
    updatedAt,
  },
  (table) => [
    primaryKey({ columns: [table.draftGroupId, table.registrationId] }),
  ],
);

export const draftOperations = pgTable(
  "draft_operations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    commandId: uuid("command_id").notNull(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => groupingDrafts.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    baseVersion: integer("base_version").notNull(),
    resultingVersion: integer("resulting_version").notNull(),
    operationType: varchar("operation_type", { length: 100 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("draft_operations_command_unique").on(table.commandId),
    index("draft_operations_draft_version_index").on(
      table.draftId,
      table.resultingVersion,
    ),
  ],
);

export const importBatches = pgTable(
  "import_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sourceAdapter: varchar("source_adapter", { length: 100 }).notNull(),
    adapterVersion: varchar("adapter_version", { length: 50 }).notNull(),
    fileHash: varchar("file_hash", { length: 128 }).notNull(),
    status: varchar("status", { length: 32 }).default("uploaded").notNull(),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    reconciliation: jsonb("reconciliation").$type<Record<string, unknown>>(),
    retentionUntil: timestamp("retention_until", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("import_batches_source_hash_unique").on(
      table.organizationId,
      table.sourceAdapter,
      table.fileHash,
    ),
  ],
);

export const importRows = pgTable(
  "import_rows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => importBatches.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull(),
    status: varchar("status", { length: 32 }).default("pending").notNull(),
    rawHash: varchar("raw_hash", { length: 128 }).notNull(),
    normalized: jsonb("normalized").$type<Record<string, unknown>>(),
    issues: jsonb("issues").$type<Array<string>>().notNull(),
    matchDecision: jsonb("match_decision").$type<Record<string, unknown>>(),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("import_rows_batch_number_unique").on(
      table.batchId,
      table.rowNumber,
    ),
    index("import_rows_batch_status_index").on(table.batchId, table.status),
  ],
);
