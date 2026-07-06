import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  index
} from "drizzle-orm/pg-core";

export const memberKind = pgEnum("member_kind", ["human", "agent"]);
export const presenceState = pgEnum("presence_state", ["idle", "working", "waiting", "offline"]);
export const roomKind = pgEnum("room_kind", ["channel", "dm"]);
export const threadState = pgEnum("thread_state", ["working", "waiting", "done"]);
export const decisionStatus = pgEnum("decision_status", ["open", "resolved", "expired"]);
export const wakeStatus = pgEnum("wake_status", ["queued", "coalescing", "running", "completed", "cancelled", "failed"]);
export const sessionState = pgEnum("agent_session_state", ["queued", "running", "completed", "failed", "cancelled"]);
export const activityState = pgEnum("activity_state", ["action_needed", "working", "recently_done"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
};

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull(),
  ...timestamps
});

export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    kind: memberKind("kind").notNull(),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    handle: varchar("handle", { length: 80 }).notNull(),
    role: varchar("role", { length: 120 }),
    avatarUrl: text("avatar_url"),
    timezone: varchar("timezone", { length: 80 }),
    presenceState: presenceState("presence_state").default("idle").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    uniqueIndex("members_workspace_handle_idx").on(table.workspaceId, table.handle),
    index("members_workspace_presence_idx").on(table.workspaceId, table.presenceState)
  ]
);

export const agentProfiles = pgTable(
  "agent_profiles",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    adapterType: varchar("adapter_type", { length: 80 }).notNull(),
    model: varchar("model", { length: 160 }).notNull(),
    instructionsRef: text("instructions_ref"),
    capabilitiesJson: jsonb("capabilities_json").default({}).notNull(),
    budgetPolicyJson: jsonb("budget_policy_json").default({}).notNull(),
    isEnabled: boolean("is_enabled").default(true).notNull(),
    ...timestamps
  },
  (table) => [
    uniqueIndex("agent_profiles_workspace_member_idx").on(table.workspaceId, table.memberId)
  ]
);

export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    kind: roomKind("kind").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    topic: text("topic"),
    createdByMemberId: uuid("created_by_member_id").references(() => members.id),
    lastMessageId: uuid("last_message_id"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    index("rooms_workspace_kind_idx").on(table.workspaceId, table.kind),
    uniqueIndex("rooms_workspace_name_kind_idx").on(table.workspaceId, table.kind, table.name)
  ]
);

export const roomMemberships = pgTable(
  "room_memberships",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    roomId: uuid("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 80 }).default("member").notNull(),
    notificationPolicy: varchar("notification_policy", { length: 80 }).default("mentions").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true })
  },
  (table) => [
    uniqueIndex("room_memberships_room_member_idx").on(table.roomId, table.memberId),
    index("room_memberships_workspace_member_idx").on(table.workspaceId, table.memberId)
  ]
);

export const dmParticipants = pgTable(
  "dm_participants",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    roomId: uuid("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("dm_participants_room_member_idx").on(table.roomId, table.memberId),
    index("dm_participants_workspace_member_idx").on(table.workspaceId, table.memberId)
  ]
);

export const threads = pgTable(
  "threads",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    roomId: uuid("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
    rootMessageId: uuid("root_message_id"),
    state: threadState("state").default("working").notNull(),
    lastMessageId: uuid("last_message_id"),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps
  },
  (table) => [
    index("threads_workspace_room_activity_idx").on(table.workspaceId, table.roomId, table.lastActivityAt)
  ]
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    roomId: uuid("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id").references(() => threads.id),
    parentMessageId: uuid("parent_message_id"),
    authorMemberId: uuid("author_member_id").notNull().references(() => members.id),
    authorKind: memberKind("author_kind").notNull(),
    body: text("body").notNull(),
    bodyFormat: varchar("body_format", { length: 40 }).default("plain").notNull(),
    blocksJson: jsonb("blocks_json").default([]).notNull(),
    mentionsJson: jsonb("mentions_json").default([]).notNull(),
    sourceClientId: varchar("source_client_id", { length: 120 }),
    editVersion: integer("edit_version").default(1).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    index("messages_workspace_room_created_idx").on(table.workspaceId, table.roomId, table.createdAt, table.id),
    index("messages_workspace_thread_created_idx").on(table.workspaceId, table.threadId, table.createdAt)
  ]
);

export const decisionBlocks = pgTable(
  "decision_blocks",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id").references(() => threads.id),
    createdByAgentMemberId: uuid("created_by_agent_member_id").notNull().references(() => members.id),
    kind: varchar("kind", { length: 80 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    prompt: text("prompt").notNull(),
    schemaJson: jsonb("schema_json").default({}).notNull(),
    status: decisionStatus("status").default("open").notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 240 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    resolvedByMemberId: uuid("resolved_by_member_id").references(() => members.id),
    resultJson: jsonb("result_json"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    index("decision_blocks_workspace_status_created_idx").on(table.workspaceId, table.status, table.createdAt),
    uniqueIndex("decision_blocks_workspace_idempotency_idx").on(table.workspaceId, table.idempotencyKey)
  ]
);

export const decisionBlockEvents = pgTable(
  "decision_block_events",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    decisionBlockId: uuid("decision_block_id").notNull().references(() => decisionBlocks.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 80 }).notNull(),
    actorMemberId: uuid("actor_member_id").references(() => members.id),
    payloadJson: jsonb("payload_json").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index("decision_block_events_block_created_idx").on(table.decisionBlockId, table.createdAt)
  ]
);

export const artifacts = pgTable(
  "artifacts",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id").references(() => threads.id),
    messageId: uuid("message_id").references(() => messages.id),
    createdByMemberId: uuid("created_by_member_id").notNull().references(() => members.id),
    kind: varchar("kind", { length: 80 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    mimeType: varchar("mime_type", { length: 120 }),
    storageKey: text("storage_key"),
    externalUrl: text("external_url"),
    previewJson: jsonb("preview_json").default({}).notNull(),
    provenanceJson: jsonb("provenance_json").default({}).notNull(),
    retentionPolicy: varchar("retention_policy", { length: 80 }).default("workspace").notNull(),
    ...timestamps
  },
  (table) => [
    index("artifacts_workspace_thread_idx").on(table.workspaceId, table.threadId, table.createdAt)
  ]
);

export const wakeEvents = pgTable(
  "wake_events",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    roomId: uuid("room_id").references(() => rooms.id),
    threadId: uuid("thread_id").references(() => threads.id),
    triggerKind: varchar("trigger_kind", { length: 80 }).notNull(),
    triggerMessageId: uuid("trigger_message_id").references(() => messages.id),
    triggerDecisionBlockId: uuid("trigger_decision_block_id").references(() => decisionBlocks.id),
    targetAgentMemberId: uuid("target_agent_member_id").notNull().references(() => members.id),
    routingPolicyVersion: varchar("routing_policy_version", { length: 80 }).notNull(),
    dedupeKey: varchar("dedupe_key", { length: 240 }).notNull(),
    status: wakeStatus("status").default("queued").notNull(),
    reasonJson: jsonb("reason_json").default({}).notNull(),
    ...timestamps
  },
  (table) => [
    uniqueIndex("wake_events_workspace_dedupe_idx").on(table.workspaceId, table.dedupeKey),
    index("wake_events_workspace_agent_status_idx").on(table.workspaceId, table.targetAgentMemberId, table.status)
  ]
);

export const wakeBatches = pgTable(
  "wake_batches",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    targetAgentMemberId: uuid("target_agent_member_id").notNull().references(() => members.id),
    roomId: uuid("room_id").references(() => rooms.id),
    threadId: uuid("thread_id").references(() => threads.id),
    debounceKey: varchar("debounce_key", { length: 240 }).notNull(),
    status: wakeStatus("status").default("coalescing").notNull(),
    coalescedMessageIds: jsonb("coalesced_message_ids").default([]).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    attemptCount: integer("attempt_count").default(0).notNull(),
    ...timestamps
  },
  (table) => [
    uniqueIndex("wake_batches_workspace_debounce_idx").on(table.workspaceId, table.debounceKey),
    index("wake_batches_workspace_status_next_idx").on(table.workspaceId, table.status, table.nextAttemptAt)
  ]
);

export const agentSessions = pgTable(
  "agent_sessions",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    agentMemberId: uuid("agent_member_id").notNull().references(() => members.id),
    roomId: uuid("room_id").references(() => rooms.id),
    threadId: uuid("thread_id").references(() => threads.id),
    wakeBatchId: uuid("wake_batch_id").references(() => wakeBatches.id),
    state: sessionState("state").default("queued").notNull(),
    adapterType: varchar("adapter_type", { length: 80 }).notNull(),
    model: varchar("model", { length: 160 }).notNull(),
    budgetLimitJson: jsonb("budget_limit_json").default({}).notNull(),
    usageJson: jsonb("usage_json").default({}).notNull(),
    loopDepth: integer("loop_depth").default(0).notNull(),
    sessionRef: text("session_ref"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    lastOutputAt: timestamp("last_output_at", { withTimezone: true }),
    errorJson: jsonb("error_json"),
    ...timestamps
  },
  (table) => [
    index("agent_sessions_workspace_agent_state_idx").on(table.workspaceId, table.agentMemberId, table.state, table.lastOutputAt)
  ]
);

export const contextPacks = pgTable(
  "context_packs",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    agentSessionId: uuid("agent_session_id").notNull().references(() => agentSessions.id, { onDelete: "cascade" }),
    version: integer("version").default(1).notNull(),
    inputJson: jsonb("input_json").notNull(),
    tokenBudgetJson: jsonb("token_budget_json").default({}).notNull(),
    includedMessageIds: jsonb("included_message_ids").default([]).notNull(),
    includedSummaryIds: jsonb("included_summary_ids").default([]).notNull(),
    redactionReportJson: jsonb("redaction_report_json").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index("context_packs_workspace_session_idx").on(table.workspaceId, table.agentSessionId)
  ]
);

export const activityItems = pgTable(
  "activity_items",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    roomId: uuid("room_id").references(() => rooms.id),
    threadId: uuid("thread_id").references(() => threads.id),
    subjectKind: varchar("subject_kind", { length: 80 }).notNull(),
    subjectId: uuid("subject_id").notNull(),
    actorMemberId: uuid("actor_member_id").references(() => members.id),
    state: activityState("state").notNull(),
    sortAt: timestamp("sort_at", { withTimezone: true }).notNull(),
    summary: text("summary").notNull(),
    ...timestamps
  },
  (table) => [
    index("activity_items_workspace_state_sort_idx").on(table.workspaceId, table.state, table.sortAt)
  ]
);

export const miraMonitorStates = pgTable(
  "mira_monitor_states",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    agentMemberId: uuid("agent_member_id").notNull().references(() => members.id),
    enabled: boolean("enabled").default(true).notNull(),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastError: text("last_error"),
    ...timestamps
  },
  (table) => [
    uniqueIndex("mira_monitor_states_workspace_idx").on(table.workspaceId),
    index("mira_monitor_states_agent_idx").on(table.workspaceId, table.agentMemberId)
  ]
);

export const miraMonitorEvents = pgTable(
  "mira_monitor_events",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    agentMemberId: uuid("agent_member_id").notNull().references(() => members.id),
    eventKind: varchar("event_kind", { length: 80 }).notNull(),
    severity: varchar("severity", { length: 40 }).default("info").notNull(),
    summary: text("summary").notNull(),
    metadataJson: jsonb("metadata_json").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index("mira_monitor_events_workspace_created_idx").on(table.workspaceId, table.createdAt),
    index("mira_monitor_events_agent_created_idx").on(table.workspaceId, table.agentMemberId, table.createdAt)
  ]
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    eventSeq: integer("event_seq").notNull(),
    eventType: varchar("event_type", { length: 120 }).notNull(),
    aggregateKind: varchar("aggregate_kind", { length: 80 }).notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    payloadJson: jsonb("payload_json").default({}).notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("outbox_events_workspace_seq_idx").on(table.workspaceId, table.eventSeq),
    index("outbox_events_workspace_delivered_idx").on(table.workspaceId, table.deliveredAt)
  ]
);
