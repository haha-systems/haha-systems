import { randomUUID } from "node:crypto";
import type {
  ActivitySummary,
  AgentProfileSummary,
  AgentSummary,
  ArtifactKind,
  ArtifactPreview,
  ArtifactSummary,
  BootstrapPayload,
  DecisionBlockKind,
  DecisionBlockStatus,
  DecisionBlockSummary,
  MemberSummary,
  MiraMonitorActivitySummary,
  MiraMonitorSummary,
  MessageSummary,
  RoomSummary,
  ThreadStateSummary,
  ThreadStatus,
  WakeEventSummary,
  WorkspaceEvent,
  WorkspaceSummary
} from "../shared/types.js";
import { DEV_EVENT_TOKEN, seedMembers, seedWorkspace } from "../shared/seed-data.js";
import type { SqlClient } from "../db/runtime.js";

type JsonValue = string | unknown[] | Record<string, unknown> | null;
type MessageRow = {
  id: string;
  workspace_id: string;
  room_id: string;
  thread_id: string | null;
  parent_message_id: string | null;
  author_member_id: string;
  author_kind: MessageSummary["authorKind"];
  body: string;
  body_format: MessageSummary["bodyFormat"];
  blocks_json: JsonValue;
  mentions_json: JsonValue;
  source_client_id: string | null;
  edit_version: number;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
};
type ArtifactRow = {
  id: string;
  workspace_id: string;
  thread_id: string | null;
  message_id: string | null;
  created_by_member_id: string;
  kind: string;
  title: string;
  mime_type: string | null;
  storage_key: string | null;
  external_url: string | null;
  preview_json: JsonValue;
  provenance_json: JsonValue;
  retention_policy: string;
  created_at: Date | string;
  updated_at: Date | string;
};
type ActivityRow = {
  id: string;
  workspace_id: string;
  room_id: string;
  thread_id: string | null;
  subject_kind: ActivitySummary["subjectKind"];
  subject_id: string;
  actor_member_id: string | null;
  action_owner_member_id: string | null;
  state: ActivitySummary["state"];
  summary: string;
  sort_at: Date | string;
};
type AgentRow = {
  member_id: string;
  workspace_id: string;
  kind: MemberSummary["kind"];
  display_name: string;
  handle: string;
  role: string | null;
  presence_state: MemberSummary["presenceState"];
  profile_id: string;
  adapter_type: string;
  model: string;
  instructions_ref: string | null;
  capabilities_json: JsonValue;
  budget_policy_json: JsonValue;
  is_enabled: boolean;
  profile_created_at: Date | string;
  profile_updated_at: Date | string;
  dm_room_id: string | null;
};
type ThreadStateRow = {
  id: string;
  workspace_id: string;
  room_id: string;
  root_message_id: string | null;
  status: ThreadStatus;
  actor_member_id: string | null;
  last_activity_at: Date | string;
};
type DecisionBlockRow = {
  id: string;
  workspace_id: string;
  message_id: string;
  thread_id: string | null;
  created_by_agent_member_id: string;
  kind: string;
  title: string;
  prompt: string;
  schema_json: JsonValue;
  status: DecisionBlockStatus;
  idempotency_key: string;
  expires_at: Date | string | null;
  resolved_by_member_id: string | null;
  result_json: JsonValue;
  resolved_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};
type WakeEventRow = {
  id: string;
  workspace_id: string;
  room_id: string | null;
  thread_id: string | null;
  trigger_kind: string;
  trigger_message_id: string | null;
  trigger_decision_block_id: string | null;
  target_agent_member_id: string;
  routing_policy_version: string;
  dedupe_key: string;
  status: WakeEventSummary["status"];
  reason_json: JsonValue;
  created_at: Date | string;
  updated_at: Date | string;
};
type AgentTargetLookup = {
  member_id: string;
  kind: MemberSummary["kind"];
  handle: string;
  adapter_type: string;
  model: string;
  is_enabled: boolean;
};
type AgentRoutingTarget = {
  memberId: string;
  handle: string;
  adapterType: string;
  model: string;
  isEnabled: boolean;
};
type AgentRoutingResult = {
  targets: AgentRoutingTarget[];
  disabledIds: string[];
  missingIds: string[];
};
type MiraMonitorRow = {
  id: string;
  workspace_id: string;
  agent_member_id: string;
  enabled: boolean;
  last_checked_at: Date | string | null;
  last_error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};
type MiraMonitorActivityRow = {
  id: string;
  workspace_id: string;
  agent_member_id: string;
  event_kind: string;
  severity: string;
  summary: string;
  created_at: Date | string;
};

export class ChatRepositoryError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export interface SendMessageInput {
  roomId: string;
  authorMemberId: string;
  body: string;
  workspaceId?: string;
  bodyFormat?: MessageSummary["bodyFormat"];
  blocks?: Array<Record<string, unknown>>;
  mentions?: string[];
  sourceClientId?: string;
}

export interface ReplyInput extends Omit<SendMessageInput, "roomId"> {
  parentMessageId: string;
}

export interface EditMessageInput {
  messageId: string;
  editorMemberId: string;
  body: string;
  blocks?: Array<Record<string, unknown>>;
  mentions?: string[];
}

export interface DeleteMessageInput {
  messageId: string;
  deletedByMemberId: string;
  reason?: string;
}

export interface CreateArtifactInput {
  workspaceId?: string;
  messageId?: string;
  threadId?: string;
  createdByMemberId: string;
  kind: ArtifactKind;
  title: string;
  mimeType?: string;
  storageKey?: string;
  externalUrl?: string;
  preview?: Record<string, unknown>;
  provenance?: Record<string, unknown>;
  retentionPolicy?: string;
}

export interface CreateAgentInput {
  workspaceId?: string;
  createdByMemberId: string;
  displayName: string;
  handle: string;
  role?: string | null;
  avatarUrl?: string | null;
  timezone?: string | null;
  adapterType?: string;
  model?: string;
  instructionsRef?: string | null;
  capabilities?: Record<string, unknown>;
  budgetPolicy?: Record<string, unknown>;
  isEnabled?: boolean;
}

export interface UpdateAgentInput {
  workspaceId: string;
  memberId: string;
  updatedByMemberId: string;
  displayName?: string;
  handle?: string;
  role?: string | null;
  avatarUrl?: string | null;
  timezone?: string | null;
  adapterType?: string;
  model?: string;
  instructionsRef?: string | null;
  capabilities?: Record<string, unknown>;
  budgetPolicy?: Record<string, unknown>;
  isEnabled?: boolean;
}

export interface CreateDecisionBlockInput {
  messageId: string;
  createdByAgentMemberId: string;
  kind: DecisionBlockKind;
  title: string;
  prompt: string;
  schema?: Record<string, unknown>;
  idempotencyKey?: string;
  expiresAt?: string;
}

export interface ResolveDecisionBlockInput {
  decisionBlockId: string;
  resolvedByMemberId: string;
  result: Record<string, unknown>;
  expectedUpdatedAt?: string;
}

export interface ChatMutationResult {
  message: MessageSummary;
  events: WorkspaceEvent[];
  idempotent?: boolean;
}

export interface ArtifactMutationResult {
  artifact: ArtifactSummary;
  events: WorkspaceEvent[];
}

export interface DecisionBlockMutationResult {
  decisionBlock: DecisionBlockSummary;
  message: MessageSummary;
  events: WorkspaceEvent[];
  wakeEvent?: WakeEventSummary;
  idempotent?: boolean;
}

export interface MiraMonitorMutationResult {
  miraMonitor: MiraMonitorSummary;
  events: WorkspaceEvent[];
}

export interface AgentMutationResult {
  agent: AgentSummary;
  events: WorkspaceEvent[];
}

function parseJsonArray(value: JsonValue): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value as Array<Record<string, unknown>>;
  }
  if (typeof value === "string") {
    return JSON.parse(value) as Array<Record<string, unknown>>;
  }
  return [];
}

function parseStringArray(value: JsonValue): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (typeof value === "string") {
    return JSON.parse(value) as string[];
  }
  return [];
}

function parseJsonObject(value: JsonValue): Record<string, unknown> {
  if (typeof value === "string") {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return {};
}

function dedupeIds(values: string[]): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      output.push(value);
    }
  }
  return output;
}

function safeUuid(value: string): string | null {
  const text = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isoNullable(value: Date | string | null): string | null {
  return value ? iso(value) : null;
}

function mapMessage(message: MessageRow): MessageSummary {
  return {
    id: message.id,
    workspaceId: message.workspace_id,
    roomId: message.room_id,
    threadId: message.thread_id,
    parentMessageId: message.parent_message_id,
    authorMemberId: message.author_member_id,
    authorKind: message.author_kind,
    body: message.body,
    bodyFormat: message.body_format,
    blocks: parseJsonArray(message.blocks_json),
    mentions: parseStringArray(message.mentions_json),
    sourceClientId: message.source_client_id,
    editVersion: message.edit_version,
    createdAt: iso(message.created_at),
    updatedAt: iso(message.updated_at),
    deletedAt: isoNullable(message.deleted_at)
  };
}

function mapArtifact(artifact: ArtifactRow): ArtifactSummary {
  const kind = toArtifactKind(artifact.kind);
  return {
    id: artifact.id,
    workspaceId: artifact.workspace_id,
    threadId: artifact.thread_id,
    messageId: artifact.message_id,
    createdByMemberId: artifact.created_by_member_id,
    kind,
    title: artifact.title,
    mimeType: artifact.mime_type,
    storageKey: artifact.storage_key,
    externalUrl: artifact.external_url,
    preview: sanitizePreview(kind, parseJsonObject(artifact.preview_json), artifact.external_url),
    provenance: sanitizeProvenance(parseJsonObject(artifact.provenance_json)),
    retentionPolicy: artifact.retention_policy,
    createdAt: iso(artifact.created_at),
    updatedAt: iso(artifact.updated_at)
  };
}

function mapActivity(item: ActivityRow): ActivitySummary {
  return {
    id: item.id,
    workspaceId: item.workspace_id,
    roomId: item.room_id,
    threadId: item.thread_id,
    subjectKind: item.subject_kind,
    subjectId: item.subject_id,
    actorMemberId: item.actor_member_id,
    actionOwnerMemberId: item.action_owner_member_id,
    state: item.state,
    summary: item.summary,
    sortAt: iso(item.sort_at)
  };
}

function mapAgent(row: AgentRow): AgentSummary {
  return {
    member: {
      id: row.member_id,
      workspaceId: row.workspace_id,
      kind: "agent",
      displayName: row.display_name,
      handle: row.handle,
      role: row.role,
      presenceState: row.is_enabled ? row.presence_state : "offline",
      isEnabled: row.is_enabled
    },
    profile: {
      id: row.profile_id,
      workspaceId: row.workspace_id,
      memberId: row.member_id,
      adapterType: row.adapter_type,
      model: row.model,
      instructionsRef: row.instructions_ref,
      capabilities: parseJsonObject(row.capabilities_json),
      budgetPolicy: parseJsonObject(row.budget_policy_json),
      isEnabled: row.is_enabled,
      createdAt: iso(row.profile_created_at),
      updatedAt: iso(row.profile_updated_at)
    },
    dmRoomId: row.dm_room_id
  };
}

function mapThreadState(thread: ThreadStateRow): ThreadStateSummary {
  return {
    id: thread.id,
    workspaceId: thread.workspace_id,
    roomId: thread.room_id,
    rootMessageId: thread.root_message_id,
    status: thread.status,
    actorMemberId: thread.actor_member_id,
    lastActivityAt: iso(thread.last_activity_at)
  };
}

function mapDecisionBlock(row: DecisionBlockRow): DecisionBlockSummary {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    messageId: row.message_id,
    threadId: row.thread_id,
    createdByAgentMemberId: row.created_by_agent_member_id,
    kind: toDecisionBlockKind(row.kind),
    title: row.title,
    prompt: row.prompt,
    schema: parseJsonObject(row.schema_json),
    status: row.status,
    idempotencyKey: row.idempotency_key,
    expiresAt: isoNullable(row.expires_at),
    resolvedByMemberId: row.resolved_by_member_id,
    result: row.result_json ? parseJsonObject(row.result_json) : null,
    resolvedAt: isoNullable(row.resolved_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

function mapWakeEvent(row: WakeEventRow): WakeEventSummary {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    roomId: row.room_id,
    threadId: row.thread_id,
    triggerKind: row.trigger_kind,
    triggerMessageId: row.trigger_message_id,
    triggerDecisionBlockId: row.trigger_decision_block_id,
    targetAgentMemberId: row.target_agent_member_id,
    routingPolicyVersion: row.routing_policy_version,
    dedupeKey: row.dedupe_key,
    status: row.status,
    reason: parseJsonObject(row.reason_json),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

function toMiraActivityKind(value: string): MiraMonitorActivitySummary["kind"] {
  if (value === "check" || value === "action" || value === "note") {
    return value;
  }
  return "note";
}

function toMiraActivitySeverity(value: string): MiraMonitorActivitySummary["severity"] {
  if (value === "info" || value === "warning" || value === "error") {
    return value;
  }
  return "info";
}

function mapMiraMonitorActivity(row: MiraMonitorActivityRow): MiraMonitorActivitySummary {
  return {
    id: row.id,
    kind: toMiraActivityKind(row.event_kind),
    summary: row.summary,
    severity: toMiraActivitySeverity(row.severity),
    createdAt: iso(row.created_at)
  };
}

function mapMiraMonitor(
  row: MiraMonitorRow,
  lastHourActivity: MiraMonitorActivitySummary[]
): MiraMonitorSummary {
  const health: MiraMonitorSummary["health"] = !row.enabled
    ? "disabled"
    : row.last_error
      ? "error"
      : lastHourActivity.length > 0
        ? "active"
        : "empty";

  return {
    workspaceId: row.workspace_id,
    agentMemberId: row.agent_member_id,
    enabled: row.enabled,
    health,
    lastCheckedAt: isoNullable(row.last_checked_at),
    errorMessage: row.last_error,
    lastHourActivity,
    updatedAt: iso(row.updated_at)
  };
}

function toDecisionBlockKind(value: unknown): DecisionBlockKind {
  if (value === "approve_reject" || value === "short_question" || value === "pick_one") {
    return value;
  }
  throw new ChatRepositoryError("Decision kind must be approve_reject, short_question, or pick_one", 422);
}

function toArtifactKind(value: unknown): ArtifactKind {
  if (value === "markdown" || value === "link" || value === "file" || value === "image") {
    return value;
  }
  throw new ChatRepositoryError("Artifact kind must be markdown, link, file, or image", 422);
}

function cleanText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.slice(0, maxLength);
}

function cleanHandle(value: unknown): string | undefined {
  const normalized = cleanText(value, 80)?.toLowerCase();
  if (!normalized || !/^[a-z0-9][a-z0-9_-]{1,79}$/.test(normalized)) {
    return undefined;
  }
  return normalized;
}

function cleanNullableText(value: unknown, maxLength: number): string | null {
  return cleanText(value, maxLength) ?? null;
}

function cleanJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

const ROUTING_POLICY_VERSION = "chat-workspace:v1";

function cleanUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2048) {
    return undefined;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function cleanPositiveInteger(value: unknown, max: number): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  const integer = Math.trunc(parsed);
  if (integer < 0 || integer > max) {
    return undefined;
  }
  return integer;
}

function sanitizePreview(
  kind: ArtifactKind,
  preview: Record<string, unknown>,
  externalUrl?: string | null
): ArtifactPreview {
  const description = cleanText(preview.description, 280);
  const fileName = cleanText(preview.fileName, 180);
  const sizeBytes = cleanPositiveInteger(preview.sizeBytes, 5_000_000_000);
  const width = cleanPositiveInteger(preview.width, 20000);
  const height = cleanPositiveInteger(preview.height, 20000);

  if (kind === "markdown") {
    return {
      excerpt: cleanText(preview.excerpt ?? preview.markdown ?? preview.content, 600) ?? "Markdown preview unavailable",
      description
    };
  }

  if (kind === "link") {
    return {
      url: cleanUrl(preview.url) ?? cleanUrl(externalUrl),
      description,
      imageUrl: cleanUrl(preview.imageUrl)
    };
  }

  if (kind === "file") {
    return {
      fileName,
      sizeBytes,
      description
    };
  }

  return {
    imageUrl: cleanUrl(preview.imageUrl) ?? cleanUrl(externalUrl),
    altText: cleanText(preview.altText, 180) ?? cleanText(preview.description, 180),
    width,
    height,
    sizeBytes,
    description
  };
}

function sanitizeProvenance(input: Record<string, unknown>): ArtifactSummary["provenance"] {
  const allowed: ArtifactSummary["provenance"] = {};
  for (const [key, value] of Object.entries(input)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(key)) {
      continue;
    }
    if (typeof value === "string") {
      allowed[key] = value.slice(0, 240);
    } else if (typeof value === "number" && Number.isFinite(value)) {
      allowed[key] = value;
    } else if (typeof value === "boolean" || value === null) {
      allowed[key] = value;
    }
  }
  return allowed;
}

function normalizeDecisionSchema(kind: DecisionBlockKind, schema: Record<string, unknown> = {}): Record<string, unknown> {
  if (kind === "approve_reject") {
    return {
      type: "approve_reject",
      approveLabel: cleanText(schema.approveLabel, 48) ?? "Approve",
      rejectLabel: cleanText(schema.rejectLabel, 48) ?? "Reject"
    };
  }

  if (kind === "short_question") {
    return {
      type: "short_question",
      placeholder: cleanText(schema.placeholder, 120) ?? "Type your answer",
      maxLength: cleanPositiveInteger(schema.maxLength, 2000) ?? 500
    };
  }

  const rawOptions = Array.isArray(schema.options) ? schema.options : [];
  const options = rawOptions.map((option) => cleanText(option, 120)).filter((option): option is string => Boolean(option));
  if (options.length === 0) {
    throw new ChatRepositoryError("Pick-one decisions require options", 422);
  }
  return { type: "single_select", options: options.slice(0, 12) };
}

function cleanDecisionResult(kind: DecisionBlockKind, schema: Record<string, unknown>, result: Record<string, unknown>): Record<string, unknown> {
  if (kind === "approve_reject") {
    if (result.decision !== "approved" && result.decision !== "rejected") {
      throw new ChatRepositoryError("Approve/reject decisions require decision=approved or rejected", 422);
    }
    return {
      decision: result.decision,
      note: cleanNullableText(result.note, 1000)
    };
  }

  if (kind === "short_question") {
    const maxLength = cleanPositiveInteger(schema.maxLength, 2000) ?? 500;
    const answer = cleanText(result.answer, maxLength);
    if (!answer) {
      throw new ChatRepositoryError("Short-question decisions require an answer", 422);
    }
    return { answer };
  }

  const options = Array.isArray(schema.options) ? schema.options.map(String) : [];
  const choice = typeof result.choice === "string" ? result.choice : undefined;
  if (!choice || !options.includes(choice)) {
    throw new ChatRepositoryError("Pick-one decisions require a valid choice", 422);
  }
  return { choice };
}

function decisionBlockToMessageBlock(block: DecisionBlockSummary): Record<string, unknown> {
  const messageBlock: Record<string, unknown> = {
    type: "decision",
    id: block.id,
    kind: block.kind,
    title: block.title,
    prompt: block.prompt,
    status: block.status,
    updatedAt: block.updatedAt,
    resolvedAt: block.resolvedAt,
    resolvedByMemberId: block.resolvedByMemberId,
    result: block.result
  };

  if (block.kind === "approve_reject") {
    messageBlock.approveLabel = String(block.schema.approveLabel ?? "Approve");
    messageBlock.rejectLabel = String(block.schema.rejectLabel ?? "Reject");
  } else if (block.kind === "short_question") {
    messageBlock.placeholder = String(block.schema.placeholder ?? "Type your answer");
    messageBlock.maxLength = Number(block.schema.maxLength ?? 500);
  } else {
    messageBlock.options = Array.isArray(block.schema.options) ? block.schema.options.map(String) : [];
  }

  return messageBlock;
}

function upsertDecisionMessageBlock(
  blocks: Array<Record<string, unknown>>,
  decisionBlock: DecisionBlockSummary
): Array<Record<string, unknown>> {
  const rendered = decisionBlockToMessageBlock(decisionBlock);
  const existingIndex = blocks.findIndex((block) => block.type === "decision" && block.id === decisionBlock.id);
  if (existingIndex === -1) {
    return [...blocks, rendered];
  }
  const next = [...blocks];
  next[existingIndex] = rendered;
  return next;
}

function parseExpectedUpdatedAt(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ChatRepositoryError("expectedUpdatedAt must be an ISO timestamp", 422);
  }
  return parsed.toISOString();
}

function normalizeLimit(value: unknown): number {
  const parsed = Number(value ?? 50);
  if (!Number.isFinite(parsed)) {
    return 50;
  }
  return Math.max(1, Math.min(100, Math.trunc(parsed)));
}

export function getMessageLimit(value: unknown): number {
  return normalizeLimit(value);
}

async function getMemberKind(client: SqlClient, workspaceId: string, memberId: string): Promise<MemberSummary["kind"]> {
  const result = await client.query<{ kind: MemberSummary["kind"] }>(
    "SELECT kind FROM members WHERE workspace_id = $1 AND id = $2",
    [workspaceId, memberId]
  );
  if (result.rows.length === 0) {
    throw new ChatRepositoryError("Member is not part of this workspace", 403);
  }
  return result.rows[0].kind;
}

async function getVisibleRoom(
  client: SqlClient,
  roomId: string,
  memberId: string,
  workspaceId?: string
): Promise<{ id: string; workspace_id: string; kind: RoomSummary["kind"] }> {
  const result = await client.query<{ id: string; workspace_id: string; kind: RoomSummary["kind"] }>(
    `
    SELECT rooms.id, rooms.workspace_id, rooms.kind
    FROM rooms
    INNER JOIN room_memberships
      ON room_memberships.room_id = rooms.id
      AND room_memberships.member_id = $2
      AND room_memberships.archived_at IS NULL
    WHERE rooms.id = $1
      AND rooms.archived_at IS NULL
      AND ($3::uuid IS NULL OR rooms.workspace_id = $3::uuid)
      AND (
        rooms.kind = 'channel'
        OR EXISTS (
          SELECT 1 FROM dm_participants
          WHERE dm_participants.room_id = rooms.id
            AND dm_participants.member_id = $2
        )
      )
    `,
    [roomId, memberId, workspaceId ?? null]
  );
  if (result.rows.length === 0) {
    throw new ChatRepositoryError("Room is not visible to this member", 403);
  }
  await getMemberKind(client, result.rows[0].workspace_id, memberId);
  return result.rows[0];
}

async function getVisibleMessage(
  client: SqlClient,
  messageId: string,
  memberId: string
): Promise<MessageSummary> {
  const result = await client.query<MessageRow>(
    `
    SELECT
      messages.id,
      messages.workspace_id,
      messages.room_id,
      messages.thread_id,
      messages.parent_message_id,
      messages.author_member_id,
      messages.author_kind,
      messages.body,
      messages.body_format,
      messages.blocks_json,
      messages.mentions_json,
      messages.source_client_id,
      messages.edit_version,
      messages.created_at,
      messages.updated_at,
      messages.deleted_at
    FROM messages
    INNER JOIN room_memberships
      ON room_memberships.room_id = messages.room_id
      AND room_memberships.member_id = $2
      AND room_memberships.archived_at IS NULL
    WHERE messages.id = $1
      AND (
        EXISTS (SELECT 1 FROM rooms WHERE rooms.id = messages.room_id AND rooms.kind = 'channel')
        OR EXISTS (
          SELECT 1 FROM dm_participants
          WHERE dm_participants.room_id = messages.room_id
            AND dm_participants.member_id = $2
        )
      )
    `,
    [messageId, memberId]
  );
  if (result.rows.length === 0) {
    throw new ChatRepositoryError("Message is not visible to this member", 404);
  }
  return mapMessage(result.rows[0]);
}

async function getVisibleThread(
  client: SqlClient,
  threadId: string,
  memberId: string
): Promise<{ id: string; room_id: string; workspace_id: string; root_message_id: string | null }> {
  const result = await client.query<{ id: string; room_id: string; workspace_id: string; root_message_id: string | null }>(
    "SELECT id, room_id, workspace_id, root_message_id FROM threads WHERE id = $1",
    [threadId]
  );
  if (result.rows.length === 0) {
    throw new ChatRepositoryError("Thread was not found", 404);
  }
  await getVisibleRoom(client, result.rows[0].room_id, memberId, result.rows[0].workspace_id);
  return result.rows[0];
}

async function loadArtifactById(client: SqlClient, artifactId: string): Promise<ArtifactSummary> {
  const result = await client.query<ArtifactRow>(
    `
    SELECT
      id,
      workspace_id,
      thread_id,
      message_id,
      created_by_member_id,
      kind,
      title,
      mime_type,
      storage_key,
      external_url,
      preview_json,
      provenance_json,
      retention_policy,
      created_at,
      updated_at
    FROM artifacts
    WHERE id = $1
    `,
    [artifactId]
  );
  if (result.rows.length === 0) {
    throw new ChatRepositoryError("Artifact was not found", 404);
  }
  return mapArtifact(result.rows[0]);
}

export async function getVisibleArtifact(
  client: SqlClient,
  artifactId: string,
  memberId: string
): Promise<ArtifactSummary> {
  const result = await client.query<ArtifactRow & { room_id: string | null }>(
    `
    SELECT
      artifacts.id,
      artifacts.workspace_id,
      artifacts.thread_id,
      artifacts.message_id,
      artifacts.created_by_member_id,
      artifacts.kind,
      artifacts.title,
      artifacts.mime_type,
      artifacts.storage_key,
      artifacts.external_url,
      artifacts.preview_json,
      artifacts.provenance_json,
      artifacts.retention_policy,
      artifacts.created_at,
      artifacts.updated_at,
      COALESCE(messages.room_id, threads.room_id) AS room_id
    FROM artifacts
    LEFT JOIN messages ON messages.id = artifacts.message_id
    LEFT JOIN threads ON threads.id = artifacts.thread_id
    WHERE artifacts.id = $1
    `,
    [artifactId]
  );
  if (result.rows.length === 0 || !result.rows[0].room_id) {
    throw new ChatRepositoryError("Artifact was not found", 404);
  }
  await getVisibleRoom(client, result.rows[0].room_id, memberId, result.rows[0].workspace_id);
  return mapArtifact(result.rows[0]);
}

async function findMessageBySourceClientId(
  client: SqlClient,
  workspaceId: string,
  roomId: string,
  sourceClientId?: string
): Promise<MessageSummary | null> {
  if (!sourceClientId) {
    return null;
  }
  const result = await client.query<MessageRow>(
    `
    SELECT
      id,
      workspace_id,
      room_id,
      thread_id,
      parent_message_id,
      author_member_id,
      author_kind,
      body,
      body_format,
      blocks_json,
      mentions_json,
      source_client_id,
      edit_version,
      created_at,
      updated_at,
      deleted_at
    FROM messages
    WHERE workspace_id = $1 AND room_id = $2 AND source_client_id = $3
    `,
    [workspaceId, roomId, sourceClientId]
  );
  return result.rows[0] ? mapMessage(result.rows[0]) : null;
}

async function loadMentionTargets(
  client: SqlClient,
  workspaceId: string,
  mentionIds: string[]
): Promise<AgentRoutingResult> {
  const unique = dedupeIds(mentionIds.map((id) => id.trim()).filter((id) => safeUuid(id)));
  if (unique.length === 0) {
    return { targets: [], disabledIds: [], missingIds: [] };
  }

  const result = await client.query<AgentTargetLookup>(
    `
    SELECT
      members.id AS member_id,
      members.kind,
      members.handle,
      COALESCE(agent_profiles.adapter_type, 'local-adapter') AS adapter_type,
      COALESCE(agent_profiles.model, 'gpt-5-codex') AS model,
      COALESCE(agent_profiles.is_enabled, false) AS is_enabled
    FROM members
    LEFT JOIN agent_profiles
      ON agent_profiles.workspace_id = members.workspace_id
      AND agent_profiles.member_id = members.id
    WHERE members.workspace_id = $1
      AND members.id = ANY($2::uuid[])
    `,
    [workspaceId, unique]
  );

  const byId = new Map<string, AgentTargetLookup>(result.rows.map((row) => [row.member_id, row]));
  const found = new Set(result.rows.map((row) => row.member_id));
  const disabledIds = unique.filter((id) => {
    const row = byId.get(id);
    return row?.kind === "agent" && row?.is_enabled === false;
  });
  const missingIds = unique.filter((id) => !found.has(id));
  const targets = result.rows
    .filter((row): row is AgentTargetLookup => row.kind === "agent" && row.is_enabled)
    .map((row) => ({
      memberId: row.member_id,
      handle: row.handle,
      adapterType: row.adapter_type,
      model: row.model,
      isEnabled: row.is_enabled
    }));

  return { targets, disabledIds, missingIds };
}

async function loadDirectMessageTargets(client: SqlClient, roomId: string, senderMemberId: string): Promise<AgentRoutingResult> {
  const result = await client.query<AgentTargetLookup>(
    `
    SELECT
      members.id AS member_id,
      members.kind,
      members.handle,
      COALESCE(agent_profiles.adapter_type, 'local-adapter') AS adapter_type,
      COALESCE(agent_profiles.model, 'gpt-5-codex') AS model,
      COALESCE(agent_profiles.is_enabled, false) AS is_enabled
    FROM dm_participants
    INNER JOIN members
      ON members.id = dm_participants.member_id
      AND dm_participants.room_id = $1
      AND members.kind = 'agent'
      AND members.id <> $2
    INNER JOIN rooms
      ON rooms.id = dm_participants.room_id
    LEFT JOIN agent_profiles
      ON agent_profiles.workspace_id = rooms.workspace_id
      AND agent_profiles.member_id = members.id
    `,
    [roomId, senderMemberId]
  );

  return {
    targets: result.rows
      .filter((row): row is AgentTargetLookup => row.kind === "agent" && row.is_enabled)
      .map((row) => ({
        memberId: row.member_id,
        handle: row.handle,
        adapterType: row.adapter_type,
        model: row.model,
        isEnabled: row.is_enabled
      })),
    disabledIds: result.rows.filter((row) => row.kind === "agent" && !row.is_enabled).map((row) => row.member_id),
    missingIds: []
  };
}

function buildAgentProgressMessage(handle: string): string {
  return `${handle} is now processing your message.`;
}

async function createAgentProgressMessage(
  client: SqlClient,
  input: {
    workspaceId: string;
    roomId: string;
    threadId: string | null;
    authorMemberId: string;
    body: string;
  }
): Promise<MessageSummary> {
  const messageId = randomUUID();
  const body = input.body;
  await client.query(
    `
    INSERT INTO messages(
      id,
      workspace_id,
      room_id,
      thread_id,
      author_member_id,
      author_kind,
      body,
      body_format,
      blocks_json,
      mentions_json
    )
    VALUES ($1, $2, $3, $4, $5, 'agent', $6, 'plain', $7::jsonb, '[]'::jsonb)
    `,
      [
        messageId,
        input.workspaceId,
        input.roomId,
        input.threadId,
        input.authorMemberId,
        body,
        JSON.stringify([
          {
            type: "progress",
            mode: "ack",
            lines: [body]
          }
        ])
      ]
    );
    await client.query("UPDATE rooms SET last_message_id = $2, updated_at = now() WHERE id = $1", [input.roomId, messageId]);
  return await loadMessageById(client, messageId);
}

async function createAgentWakeAndSession(
  client: SqlClient,
  workspaceId: string,
  roomId: string,
  threadId: string | null,
  triggerKind: string,
  triggerMessageId: string,
  target: AgentRoutingTarget
): Promise<{ wakeEvent?: WakeEventSummary; message?: MessageSummary }> {
  const dedupeKey = `agent:${triggerKind}:${triggerMessageId}:${target.memberId}`;
  const existingWakeResult = await client.query<WakeEventRow>(
    `
    SELECT id, workspace_id, room_id, thread_id, trigger_kind, trigger_message_id, trigger_decision_block_id,
      target_agent_member_id, routing_policy_version, dedupe_key, status, reason_json, created_at, updated_at
    FROM wake_events
    WHERE workspace_id = $1
      AND dedupe_key = $2
      AND status NOT IN ('completed', 'cancelled', 'failed')
    LIMIT 1
    `,
    [workspaceId, dedupeKey]
  );

  let wakeEvent = existingWakeResult.rows[0] ? mapWakeEvent(existingWakeResult.rows[0]) : null;
  let created = false;

  if (!wakeEvent) {
    const wakeInsert = await client.query<WakeEventRow>(
      `
      INSERT INTO wake_events(
        id, workspace_id, room_id, thread_id, trigger_kind, trigger_message_id,
        target_agent_member_id, routing_policy_version, dedupe_key, status, reason_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'queued', $10::jsonb)
      RETURNING id, workspace_id, room_id, thread_id, trigger_kind, trigger_message_id, trigger_decision_block_id,
        target_agent_member_id, routing_policy_version, dedupe_key, status, reason_json, created_at, updated_at
      `,
      [
        randomUUID(),
        workspaceId,
        roomId,
        threadId,
        triggerKind,
        triggerMessageId,
        target.memberId,
        ROUTING_POLICY_VERSION,
        dedupeKey,
        JSON.stringify({ roomId, threadId, targetAgentMemberId: target.memberId, triggerMessageId })
      ]
    );
    wakeEvent = mapWakeEvent(wakeInsert.rows[0]);
    created = true;

    const sessionId = randomUUID();
    await client.query(
      `
      INSERT INTO agent_sessions(
        id, workspace_id, agent_member_id, room_id, thread_id, state, adapter_type, model,
        budget_limit_json, usage_json, loop_depth, session_ref, started_at, finished_at, last_output_at
      )
      VALUES ($1, $2, $3, $4, $5, 'queued', $6, $7, '{}'::jsonb, '{}'::jsonb, 0, $8, NULL, NULL, NULL)
      `,
      [
        sessionId,
        workspaceId,
        target.memberId,
        roomId,
        threadId,
        target.adapterType,
        target.model,
        wakeEvent.id
      ]
    );
  }

  return {
    wakeEvent: wakeEvent ?? undefined,
    message: created
      ? await createAgentProgressMessage(client, {
          workspaceId,
          roomId,
          threadId,
          authorMemberId: target.memberId,
          body: buildAgentProgressMessage(target.handle)
        })
      : undefined
  };
}

async function routeMessageToAgents(
  client: SqlClient,
  room: { id: string; kind: RoomSummary["kind"]; workspaceId: string },
  message: MessageSummary,
  authorKind: MemberSummary["kind"],
  mentions: string[]
): Promise<{ wakeEvents: WakeEventSummary[]; messages: MessageSummary[]; events: WorkspaceEvent[] }> {
  if (authorKind !== "human") {
    return { wakeEvents: [], messages: [], events: [] };
  }

  const dedupedMentions = dedupeIds(mentions.map((id) => id.trim()).filter((id) => safeUuid(id)));

  if (room.kind === "dm") {
    const dmTargets = await loadDirectMessageTargets(client, room.id, message.authorMemberId);
    if (dmTargets.targets.length === 0) {
      if (dmTargets.disabledIds.length > 0) {
        throw new ChatRepositoryError("DM participants include disabled or removed agents", 403);
      }
      return { wakeEvents: [], messages: [], events: [] };
    }

    return processAgentRoutes(client, room, message, dmTargets.targets, "dm_message");
  }

  if (dedupedMentions.length === 0) {
    return { wakeEvents: [], messages: [], events: [] };
  }

  const mentionTargets = await loadMentionTargets(client, room.workspaceId, dedupedMentions);
  if (mentionTargets.targets.length === 0) {
    return { wakeEvents: [], messages: [], events: [] };
  }

  return processAgentRoutes(client, room, message, mentionTargets.targets, "mention");
}

async function processAgentRoutes(
  client: SqlClient,
  room: { id: string; kind: RoomSummary["kind"]; workspaceId: string },
  message: MessageSummary,
  targets: AgentRoutingTarget[],
  triggerKind: "mention" | "dm_message"
): Promise<{ wakeEvents: WakeEventSummary[]; messages: MessageSummary[]; events: WorkspaceEvent[] }> {
  const wakeEvents: WakeEventSummary[] = [];
  const progressMessages: MessageSummary[] = [];
  const events: WorkspaceEvent[] = [];

  const dedupedTargets = dedupeIds(targets.map((target) => target.memberId));
  const uniqueTargets: AgentRoutingTarget[] = dedupedTargets
    .map((targetId) => targets.find((candidate) => candidate.memberId === targetId))
    .filter((target): target is AgentRoutingTarget => Boolean(target));

  for (const target of uniqueTargets) {
    const { wakeEvent, message: progressMessage } = await createAgentWakeAndSession(
      client,
      room.workspaceId,
      room.id,
      message.threadId,
      triggerKind,
      message.id,
      target
    );
    if (wakeEvent) {
      wakeEvents.push(wakeEvent);
      const wakeEventRecord = await appendEvent(
        client,
        room.workspaceId,
        "wake.queued",
        "wake",
        wakeEvent.id,
        { wakeEvent }
      );
      events.push(wakeEventRecord);
    }
    if (progressMessage) {
      progressMessages.push(progressMessage);
      const progressMessageRecord = await appendEvent(
        client,
        room.workspaceId,
        "message.created",
        "message",
        progressMessage.id,
        { message: progressMessage }
      );
      events.push(progressMessageRecord);
    }
  }

  return { wakeEvents, messages: progressMessages, events };
}


async function appendEvent(
  client: SqlClient,
  workspaceId: string,
  type: string,
  aggregateKind: string,
  aggregateId: string,
  payload: Record<string, unknown>
): Promise<WorkspaceEvent> {
  const result = await client.query<{ event_seq: number; created_at: Date | string; payload_json: JsonValue }>(
    `
    INSERT INTO outbox_events(id, workspace_id, event_seq, event_type, aggregate_kind, aggregate_id, payload_json)
    VALUES (
      $1,
      $2,
      COALESCE((SELECT max(event_seq) FROM outbox_events WHERE workspace_id = $2), 0) + 1,
      $3,
      $4,
      $5,
      $6::jsonb
    )
    RETURNING event_seq, created_at, payload_json
    `,
    [randomUUID(), workspaceId, type, aggregateKind, aggregateId, JSON.stringify(payload)]
  );
  return {
    workspaceId,
    sequence: result.rows[0].event_seq,
    type,
    occurredAt: iso(result.rows[0].created_at),
    payload: parseJsonObject(result.rows[0].payload_json)
  };
}

async function loadMessageById(client: SqlClient, messageId: string): Promise<MessageSummary> {
  const result = await client.query<MessageRow>(
    `
    SELECT
      id,
      workspace_id,
      room_id,
      thread_id,
      parent_message_id,
      author_member_id,
      author_kind,
      body,
      body_format,
      blocks_json,
      mentions_json,
      source_client_id,
      edit_version,
      created_at,
      updated_at,
      deleted_at
    FROM messages
    WHERE id = $1
    `,
    [messageId]
  );
  if (result.rows.length === 0) {
    throw new ChatRepositoryError("Message was not found", 404);
  }
  return mapMessage(result.rows[0]);
}

async function loadAgentByMemberId(
  client: SqlClient,
  workspaceId: string,
  memberId: string,
  viewerMemberId?: string
): Promise<AgentSummary> {
  const result = await client.query<AgentRow>(
    `
    SELECT
      members.id AS member_id,
      members.workspace_id,
      members.kind,
      members.display_name,
      members.handle,
      members.role,
      members.presence_state,
      agent_profiles.id AS profile_id,
      agent_profiles.adapter_type,
      agent_profiles.model,
      agent_profiles.instructions_ref,
      agent_profiles.capabilities_json,
      agent_profiles.budget_policy_json,
      agent_profiles.is_enabled,
      agent_profiles.created_at AS profile_created_at,
      agent_profiles.updated_at AS profile_updated_at,
      (
        SELECT rooms.id
        FROM rooms
        INNER JOIN dm_participants agent_dm
          ON agent_dm.room_id = rooms.id
          AND agent_dm.member_id = members.id
        INNER JOIN dm_participants viewer_dm
          ON viewer_dm.room_id = rooms.id
          AND ($3::uuid IS NULL OR viewer_dm.member_id = $3::uuid)
        WHERE rooms.workspace_id = members.workspace_id
          AND rooms.kind = 'dm'
          AND rooms.archived_at IS NULL
        ORDER BY rooms.created_at ASC, rooms.id ASC
        LIMIT 1
      ) AS dm_room_id
    FROM members
    INNER JOIN agent_profiles
      ON agent_profiles.workspace_id = members.workspace_id
      AND agent_profiles.member_id = members.id
    WHERE members.workspace_id = $1
      AND members.id = $2
      AND members.kind = 'agent'
    `,
    [workspaceId, memberId, viewerMemberId ?? null]
  );

  if (result.rows.length === 0) {
    throw new ChatRepositoryError("Agent was not found", 404);
  }

  return mapAgent(result.rows[0]);
}

async function updateThreadActivity(
  client: SqlClient,
  threadId: string,
  messageId: string
): Promise<{ id: string; workspace_id: string; room_id: string; last_activity_at: Date | string }> {
  const result = await client.query<{
    id: string;
    workspace_id: string;
    room_id: string;
    last_activity_at: Date | string;
  }>(
    `
    UPDATE threads
    SET last_message_id = $2, last_activity_at = now(), updated_at = now()
    WHERE id = $1
    RETURNING id, workspace_id, room_id, last_activity_at
    `,
    [threadId, messageId]
  );
  if (result.rows.length === 0) {
    throw new ChatRepositoryError("Thread was not found", 404);
  }
  return result.rows[0];
}

async function loadDecisionBlockById(client: SqlClient, decisionBlockId: string): Promise<DecisionBlockSummary> {
  const result = await client.query<DecisionBlockRow>(
    `
    SELECT id, workspace_id, message_id, thread_id, created_by_agent_member_id, kind, title, prompt, schema_json, status,
      idempotency_key, expires_at, resolved_by_member_id, result_json, resolved_at, created_at, updated_at
    FROM decision_blocks
    WHERE id = $1
    `,
    [decisionBlockId]
  );
  if (result.rows.length === 0) {
    throw new ChatRepositoryError("Decision block was not found", 404);
  }
  return mapDecisionBlock(result.rows[0]);
}

async function findDecisionBlockByIdempotencyKey(
  client: SqlClient,
  workspaceId: string,
  idempotencyKey?: string
): Promise<DecisionBlockSummary | null> {
  if (!idempotencyKey) {
    return null;
  }
  const result = await client.query<DecisionBlockRow>(
    `
    SELECT id, workspace_id, message_id, thread_id, created_by_agent_member_id, kind, title, prompt, schema_json, status,
      idempotency_key, expires_at, resolved_by_member_id, result_json, resolved_at, created_at, updated_at
    FROM decision_blocks
    WHERE workspace_id = $1 AND idempotency_key = $2
    `,
    [workspaceId, idempotencyKey]
  );
  return result.rows[0] ? mapDecisionBlock(result.rows[0]) : null;
}

async function ensureWorkspaceMember(
  client: SqlClient,
  workspaceId: string,
  memberId: string,
  expectedKind?: MemberSummary["kind"]
): Promise<MemberSummary["kind"]> {
  const kind = await getMemberKind(client, workspaceId, memberId);
  if (expectedKind && kind !== expectedKind) {
    throw new ChatRepositoryError(`Only ${expectedKind}s can perform this action`, 403);
  }
  return kind;
}

async function ensureHandleAvailable(
  client: SqlClient,
  workspaceId: string,
  handle: string,
  exceptMemberId?: string
): Promise<void> {
  const duplicate = await client.query<{ id: string }>(
    `
    SELECT id
    FROM members
    WHERE workspace_id = $1
      AND handle = $2
      AND ($3::uuid IS NULL OR id <> $3::uuid)
    LIMIT 1
    `,
    [workspaceId, handle, exceptMemberId ?? null]
  );
  if (duplicate.rows.length > 0) {
    throw new ChatRepositoryError("Agent handle is already in use", 409);
  }
}

async function cancelActiveAgentWork(client: SqlClient, workspaceId: string, memberId: string): Promise<void> {
  await client.query(
    `
    UPDATE wake_events
    SET status = 'cancelled', updated_at = now()
    WHERE workspace_id = $1
      AND target_agent_member_id = $2
      AND status IN ('queued', 'coalescing', 'running')
    `,
    [workspaceId, memberId]
  );
  await client.query(
    `
    UPDATE wake_batches
    SET status = 'cancelled', updated_at = now()
    WHERE workspace_id = $1
      AND target_agent_member_id = $2
      AND status IN ('queued', 'coalescing')
    `,
    [workspaceId, memberId]
  );
  await client.query(
    `
    UPDATE agent_sessions
    SET state = 'cancelled',
      finished_at = COALESCE(finished_at, now()),
      updated_at = now()
    WHERE workspace_id = $1
      AND agent_member_id = $2
      AND state IN ('queued', 'running')
    `,
    [workspaceId, memberId]
  );
}

async function createAgentDm(
  client: SqlClient,
  workspaceId: string,
  humanMemberId: string,
  agentMemberId: string,
  displayName: string,
  handle: string
): Promise<string> {
  const candidateNames = [displayName, `${displayName} (@${handle})`, `@${handle}`];
  let roomName = candidateNames[candidateNames.length - 1];
  for (const candidate of candidateNames) {
    const existing = await client.query<{ id: string }>(
      "SELECT id FROM rooms WHERE workspace_id = $1 AND kind = 'dm' AND name = $2 LIMIT 1",
      [workspaceId, candidate]
    );
    if (existing.rows.length === 0) {
      roomName = candidate;
      break;
    }
  }

  const roomId = randomUUID();
  await client.query(
    `
    INSERT INTO rooms(id, workspace_id, kind, name, topic, created_by_member_id)
    VALUES ($1, $2, 'dm', $3, $4, $5)
    `,
    [roomId, workspaceId, roomName, `1:1 with ${displayName}`, humanMemberId]
  );

  for (const memberId of [humanMemberId, agentMemberId]) {
    await client.query(
      `
      INSERT INTO room_memberships(id, workspace_id, room_id, member_id)
      VALUES ($1, $2, $3, $4)
      `,
      [randomUUID(), workspaceId, roomId, memberId]
    );
    await client.query(
      `
      INSERT INTO dm_participants(id, workspace_id, room_id, member_id)
      VALUES ($1, $2, $3, $4)
      `,
      [randomUUID(), workspaceId, roomId, memberId]
    );
  }

  return roomId;
}

export async function listAgentsForMember(
  client: SqlClient,
  workspaceId: string,
  memberId: string
): Promise<AgentSummary[]> {
  await ensureWorkspaceMember(client, workspaceId, memberId);
  const result = await client.query<AgentRow>(
    `
    SELECT
      members.id AS member_id,
      members.workspace_id,
      members.kind,
      members.display_name,
      members.handle,
      CASE WHEN agent_profiles.is_enabled THEN members.presence_state ELSE 'offline'::presence_state END AS presence_state,
      members.role,
      agent_profiles.id AS profile_id,
      agent_profiles.adapter_type,
      agent_profiles.model,
      agent_profiles.instructions_ref,
      agent_profiles.capabilities_json,
      agent_profiles.budget_policy_json,
      agent_profiles.is_enabled,
      agent_profiles.created_at AS profile_created_at,
      agent_profiles.updated_at AS profile_updated_at,
      (
        SELECT rooms.id
        FROM rooms
        INNER JOIN dm_participants agent_dm
          ON agent_dm.room_id = rooms.id
          AND agent_dm.member_id = members.id
        INNER JOIN dm_participants viewer_dm
          ON viewer_dm.room_id = rooms.id
          AND viewer_dm.member_id = $2
        WHERE rooms.workspace_id = members.workspace_id
          AND rooms.kind = 'dm'
          AND rooms.archived_at IS NULL
        ORDER BY rooms.created_at ASC, rooms.id ASC
        LIMIT 1
      ) AS dm_room_id
    FROM members
    INNER JOIN agent_profiles
      ON agent_profiles.workspace_id = members.workspace_id
      AND agent_profiles.member_id = members.id
    WHERE members.workspace_id = $1
      AND members.kind = 'agent'
    ORDER BY agent_profiles.is_enabled DESC, members.display_name ASC, members.handle ASC
    `,
    [workspaceId, memberId]
  );
  return result.rows.map(mapAgent);
}

export async function createAgent(client: SqlClient, input: CreateAgentInput): Promise<AgentMutationResult> {
  const workspaceId = input.workspaceId ?? seedWorkspace.id;
  await ensureWorkspaceMember(client, workspaceId, input.createdByMemberId, "human");

  const displayName = cleanText(input.displayName, 160);
  const handle = cleanHandle(input.handle);
  const adapterType = cleanText(input.adapterType ?? "local-adapter", 80);
  const model = cleanText(input.model ?? "gpt-5-codex", 160);
  if (!displayName || !handle || !adapterType || !model) {
    throw new ChatRepositoryError("displayName, valid handle, adapterType, and model are required", 422);
  }
  await ensureHandleAvailable(client, workspaceId, handle);

  const agentMemberId = randomUUID();
  const profileId = randomUUID();
  const isEnabled = input.isEnabled ?? true;

  await client.query("BEGIN");
  try {
    await client.query(
      `
      INSERT INTO members(
        id, workspace_id, kind, display_name, handle, role, avatar_url, timezone, presence_state, last_seen_at
      )
      VALUES ($1, $2, 'agent', $3, $4, $5, $6, $7, $8::presence_state, now())
      `,
      [
        agentMemberId,
        workspaceId,
        displayName,
        handle,
        cleanNullableText(input.role, 120),
        cleanNullableText(input.avatarUrl, 2048),
        cleanText(input.timezone, 80) ?? "UTC",
        isEnabled ? "idle" : "offline"
      ]
    );
    await client.query(
      `
      INSERT INTO agent_profiles(
        id, workspace_id, member_id, adapter_type, model, instructions_ref,
        capabilities_json, budget_policy_json, is_enabled
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
      `,
      [
        profileId,
        workspaceId,
        agentMemberId,
        adapterType,
        model,
        cleanNullableText(input.instructionsRef, 512),
        JSON.stringify(cleanJsonObject(input.capabilities)),
        JSON.stringify(cleanJsonObject(input.budgetPolicy)),
        isEnabled
      ]
    );
    await createAgentDm(client, workspaceId, input.createdByMemberId, agentMemberId, displayName, handle);
    const agent = await loadAgentByMemberId(client, workspaceId, agentMemberId, input.createdByMemberId);
    const event = await appendEvent(client, workspaceId, "agent.created", "agent", agent.member.id, { agent });
    await client.query("COMMIT");
    return { agent, events: [event] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function updateAgent(client: SqlClient, input: UpdateAgentInput): Promise<AgentMutationResult> {
  await ensureWorkspaceMember(client, input.workspaceId, input.updatedByMemberId);
  const current = await loadAgentByMemberId(client, input.workspaceId, input.memberId, input.updatedByMemberId);

  const displayName = input.displayName === undefined ? current.member.displayName : cleanText(input.displayName, 160);
  const handle = input.handle === undefined ? current.member.handle : cleanHandle(input.handle);
  const adapterType =
    input.adapterType === undefined ? current.profile.adapterType : cleanText(input.adapterType, 80);
  const model = input.model === undefined ? current.profile.model : cleanText(input.model, 160);
  if (!displayName || !handle || !adapterType || !model) {
    throw new ChatRepositoryError("displayName, valid handle, adapterType, and model are required", 422);
  }
  if (handle !== current.member.handle) {
    await ensureHandleAvailable(client, input.workspaceId, handle, input.memberId);
  }

  const role = input.role === undefined ? current.member.role : cleanNullableText(input.role, 120);
  const instructionsRef =
    input.instructionsRef === undefined
      ? current.profile.instructionsRef
      : cleanNullableText(input.instructionsRef, 512);
  const capabilities =
    input.capabilities === undefined ? current.profile.capabilities : cleanJsonObject(input.capabilities);
  const budgetPolicy =
    input.budgetPolicy === undefined ? current.profile.budgetPolicy : cleanJsonObject(input.budgetPolicy);
  const isEnabled = input.isEnabled ?? current.profile.isEnabled;

  await client.query("BEGIN");
  try {
    await client.query(
      `
      UPDATE members
      SET display_name = $3,
        handle = $4,
        role = $5,
        avatar_url = CASE WHEN $6::boolean THEN $7 ELSE avatar_url END,
        timezone = CASE WHEN $8::boolean THEN $9 ELSE timezone END,
        presence_state = CASE
          WHEN $10::boolean THEN CASE WHEN presence_state = 'offline' THEN 'idle'::presence_state ELSE presence_state END
          ELSE 'offline'::presence_state
        END,
        updated_at = now()
      WHERE workspace_id = $1
        AND id = $2
        AND kind = 'agent'
      `,
      [
        input.workspaceId,
        input.memberId,
        displayName,
        handle,
        role,
        input.avatarUrl !== undefined,
        cleanNullableText(input.avatarUrl, 2048),
        input.timezone !== undefined,
        cleanNullableText(input.timezone, 80),
        isEnabled
      ]
    );
    await client.query(
      `
      UPDATE agent_profiles
      SET adapter_type = $3,
        model = $4,
        instructions_ref = $5,
        capabilities_json = $6::jsonb,
        budget_policy_json = $7::jsonb,
        is_enabled = $8,
        updated_at = now()
      WHERE workspace_id = $1
        AND member_id = $2
      `,
      [
        input.workspaceId,
        input.memberId,
        adapterType,
        model,
        instructionsRef,
        JSON.stringify(capabilities),
        JSON.stringify(budgetPolicy),
        isEnabled
      ]
    );

    if (!isEnabled) {
      await cancelActiveAgentWork(client, input.workspaceId, input.memberId);
    }

    const agent = await loadAgentByMemberId(client, input.workspaceId, input.memberId, input.updatedByMemberId);
    const type =
      current.profile.isEnabled !== agent.profile.isEnabled
        ? agent.profile.isEnabled
          ? "agent.enabled"
          : "agent.disabled"
        : "agent.updated";
    const event = await appendEvent(client, input.workspaceId, type, "agent", agent.member.id, { agent });
    await client.query("COMMIT");
    return { agent, events: [event] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function removeAgent(
  client: SqlClient,
  workspaceId: string,
  memberId: string,
  removedByMemberId: string
): Promise<AgentMutationResult> {
  const result = await updateAgent(client, {
    workspaceId,
    memberId,
    updatedByMemberId: removedByMemberId,
    isEnabled: false
  });
  const event = await appendEvent(client, workspaceId, "agent.removed", "agent", result.agent.member.id, {
    agent: result.agent,
    historyPreserved: true
  });
  return { agent: result.agent, events: [...result.events, event] };
}

export async function listDecisionBlocks(
  client: SqlClient,
  workspaceId: string,
  memberId: string,
  opts: { status?: DecisionBlockStatus; messageId?: string; threadId?: string } = {}
): Promise<DecisionBlockSummary[]> {
  await getMemberKind(client, workspaceId, memberId);
  if (opts.status && opts.status !== "open" && opts.status !== "resolved" && opts.status !== "expired") {
    throw new ChatRepositoryError("Decision status must be open, resolved, or expired", 422);
  }

  const result = await client.query<DecisionBlockRow>(
    `
    SELECT
      decision_blocks.id,
      decision_blocks.workspace_id,
      decision_blocks.message_id,
      decision_blocks.thread_id,
      decision_blocks.created_by_agent_member_id,
      decision_blocks.kind,
      decision_blocks.title,
      decision_blocks.prompt,
      decision_blocks.schema_json,
      decision_blocks.status,
      decision_blocks.idempotency_key,
      decision_blocks.expires_at,
      decision_blocks.resolved_by_member_id,
      decision_blocks.result_json,
      decision_blocks.resolved_at,
      decision_blocks.created_at,
      decision_blocks.updated_at
    FROM decision_blocks
    INNER JOIN messages ON messages.id = decision_blocks.message_id
    INNER JOIN room_memberships
      ON room_memberships.room_id = messages.room_id
      AND room_memberships.member_id = $2
      AND room_memberships.archived_at IS NULL
    WHERE decision_blocks.workspace_id = $1
      AND ($3::decision_status IS NULL OR decision_blocks.status = $3::decision_status)
      AND ($4::uuid IS NULL OR decision_blocks.message_id = $4::uuid)
      AND ($5::uuid IS NULL OR decision_blocks.thread_id = $5::uuid)
      AND (
        EXISTS (SELECT 1 FROM rooms WHERE rooms.id = messages.room_id AND rooms.kind = 'channel')
        OR EXISTS (
          SELECT 1 FROM dm_participants
          WHERE dm_participants.room_id = messages.room_id
            AND dm_participants.member_id = $2
        )
      )
    ORDER BY decision_blocks.created_at DESC, decision_blocks.id DESC
    `,
    [workspaceId, memberId, opts.status ?? null, opts.messageId ?? null, opts.threadId ?? null]
  );

  return result.rows.map(mapDecisionBlock);
}

export async function createDecisionBlock(
  client: SqlClient,
  input: CreateDecisionBlockInput
): Promise<DecisionBlockMutationResult> {
  const message = await getVisibleMessage(client, input.messageId, input.createdByAgentMemberId);
  if (message.deletedAt) {
    throw new ChatRepositoryError("Cannot attach a decision to a deleted message", 422);
  }
  const memberKind = await getMemberKind(client, message.workspaceId, input.createdByAgentMemberId);
  if (memberKind !== "agent") {
    throw new ChatRepositoryError("Only agents can create decision blocks", 403);
  }

  const kind = toDecisionBlockKind(input.kind);
  const title = cleanText(input.title, 160);
  const prompt = cleanText(input.prompt, 2000);
  if (!title || !prompt) {
    throw new ChatRepositoryError("Decision title and prompt are required", 422);
  }
  const schema = normalizeDecisionSchema(kind, input.schema);
  const idempotencyKey = input.idempotencyKey ?? `decision:${message.id}:${randomUUID()}`;
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    throw new ChatRepositoryError("expiresAt must be an ISO timestamp", 422);
  }

  const existing = await findDecisionBlockByIdempotencyKey(client, message.workspaceId, idempotencyKey);
  if (existing) {
    return {
      decisionBlock: existing,
      message: await loadMessageById(client, existing.messageId),
      events: [],
      idempotent: true
    };
  }

  await client.query("BEGIN");
  try {
    const decisionBlockId = randomUUID();
    await client.query(
      `
      INSERT INTO decision_blocks(
        id, workspace_id, message_id, thread_id, created_by_agent_member_id, kind, title, prompt, schema_json,
        status, idempotency_key, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, 'open', $10, $11)
      `,
      [
        decisionBlockId,
        message.workspaceId,
        message.id,
        message.threadId,
        input.createdByAgentMemberId,
        kind,
        title,
        prompt,
        JSON.stringify(schema),
        idempotencyKey,
        expiresAt?.toISOString() ?? null
      ]
    );
    await client.query(
      `
      INSERT INTO decision_block_events(id, workspace_id, decision_block_id, event_type, actor_member_id, payload_json)
      VALUES ($1, $2, $3, 'created', $4, $5::jsonb)
      `,
      [randomUUID(), message.workspaceId, decisionBlockId, input.createdByAgentMemberId, JSON.stringify({ title, prompt, kind })]
    );

    const decisionBlock = await loadDecisionBlockById(client, decisionBlockId);
    await client.query("UPDATE messages SET blocks_json = $2::jsonb, updated_at = now() WHERE id = $1", [
      message.id,
      JSON.stringify(upsertDecisionMessageBlock(message.blocks, decisionBlock))
    ]);
    await client.query(
      `
      INSERT INTO activity_items(
        id, workspace_id, room_id, thread_id, subject_kind, subject_id, actor_member_id, state, sort_at, summary
      )
      VALUES ($1, $2, $3, $4, 'decision', $5, $6, 'action_needed', now(), $7)
      ON CONFLICT (id) DO NOTHING
      `,
      [
        randomUUID(),
        message.workspaceId,
        message.roomId,
        message.threadId,
        decisionBlock.id,
        input.createdByAgentMemberId,
        `Waiting on ${title}`
      ]
    );

    const updatedMessage = await loadMessageById(client, message.id);
    const decisionEvent = await appendEvent(client, message.workspaceId, "decision.created", "decision", decisionBlock.id, {
      decisionBlock
    });
    const messageEvent = await appendEvent(client, message.workspaceId, "message.updated", "message", message.id, {
      message: updatedMessage
    });
    await client.query("COMMIT");
    return { decisionBlock, message: updatedMessage, events: [decisionEvent, messageEvent] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function resolveDecisionBlock(
  client: SqlClient,
  input: ResolveDecisionBlockInput
): Promise<DecisionBlockMutationResult> {
  const expectedUpdatedAt = parseExpectedUpdatedAt(input.expectedUpdatedAt);
  const current = await loadDecisionBlockById(client, input.decisionBlockId);
  const message = await getVisibleMessage(client, current.messageId, input.resolvedByMemberId);
  const result = cleanDecisionResult(current.kind, current.schema, input.result);

  await client.query("BEGIN");
  try {
    const updatedResult = await client.query<DecisionBlockRow>(
      `
      UPDATE decision_blocks
      SET status = 'resolved',
        resolved_by_member_id = $2,
        result_json = $3::jsonb,
        resolved_at = now(),
        updated_at = now()
      WHERE id = $1
        AND status = 'open'
        AND ($4::timestamptz IS NULL OR updated_at = $4::timestamptz)
      RETURNING id, workspace_id, message_id, thread_id, created_by_agent_member_id, kind, title, prompt, schema_json,
        status, idempotency_key, expires_at, resolved_by_member_id, result_json, resolved_at, created_at, updated_at
      `,
      [current.id, input.resolvedByMemberId, JSON.stringify(result), expectedUpdatedAt ?? null]
    );

    if (updatedResult.rows.length === 0) {
      const latest = await loadDecisionBlockById(client, current.id);
      throw new ChatRepositoryError(
        latest.status === "resolved" ? "Decision has already been resolved" : "Decision changed before it could be resolved",
        409
      );
    }

    const decisionBlock = mapDecisionBlock(updatedResult.rows[0]);
    await client.query(
      `
      INSERT INTO decision_block_events(id, workspace_id, decision_block_id, event_type, actor_member_id, payload_json)
      VALUES ($1, $2, $3, 'resolved', $4, $5::jsonb)
      `,
      [randomUUID(), decisionBlock.workspaceId, decisionBlock.id, input.resolvedByMemberId, JSON.stringify({ result })]
    );
    await client.query("UPDATE messages SET blocks_json = $2::jsonb, updated_at = now() WHERE id = $1", [
      message.id,
      JSON.stringify(upsertDecisionMessageBlock(message.blocks, decisionBlock))
    ]);
    await client.query(
      `
      UPDATE activity_items
      SET state = 'recently_done',
        actor_member_id = $2,
        summary = $3,
        sort_at = now(),
        updated_at = now()
      WHERE workspace_id = $1
        AND subject_kind = 'decision'
        AND subject_id = $4
      `,
      [decisionBlock.workspaceId, input.resolvedByMemberId, `Resolved ${decisionBlock.title}`, decisionBlock.id]
    );

    const targetProfile = await client.query<{ is_enabled: boolean }>(
      `
      SELECT is_enabled
      FROM agent_profiles
      WHERE workspace_id = $1
        AND member_id = $2
      `,
      [decisionBlock.workspaceId, decisionBlock.createdByAgentMemberId]
    );
    const targetEnabled = targetProfile.rows[0]?.is_enabled === true;
    let wakeEvent: WakeEventSummary | undefined;
    if (targetEnabled) {
      const dedupeKey = `decision:${decisionBlock.id}:resolved`;
      const existingWake = await client.query<WakeEventRow>(
        `
        SELECT id, workspace_id, room_id, thread_id, trigger_kind, trigger_message_id, trigger_decision_block_id,
          target_agent_member_id, routing_policy_version, dedupe_key, status, reason_json, created_at, updated_at
        FROM wake_events
        WHERE workspace_id = $1
          AND dedupe_key = $2
          AND status NOT IN ('completed', 'cancelled', 'failed')
        LIMIT 1
        `,
        [decisionBlock.workspaceId, dedupeKey]
      );
      if (existingWake.rows[0]) {
        wakeEvent = mapWakeEvent(existingWake.rows[0]);
      } else {
        const wakeResult = await client.query<WakeEventRow>(
          `
          INSERT INTO wake_events(
            id, workspace_id, room_id, thread_id, trigger_kind, trigger_message_id, trigger_decision_block_id,
            target_agent_member_id, routing_policy_version, dedupe_key, status, reason_json
          )
          VALUES ($1, $2, $3, $4, 'decision_resolved', $5, $6, $7, 'chat-workspace:v1', $8, 'queued', $9::jsonb)
          RETURNING id, workspace_id, room_id, thread_id, trigger_kind, trigger_message_id, trigger_decision_block_id,
            target_agent_member_id, routing_policy_version, dedupe_key, status, reason_json, created_at, updated_at
          `,
          [
            randomUUID(),
            decisionBlock.workspaceId,
            message.roomId,
            decisionBlock.threadId,
            message.id,
            decisionBlock.id,
            decisionBlock.createdByAgentMemberId,
            dedupeKey,
            JSON.stringify({ decisionBlockId: decisionBlock.id, resolvedByMemberId: input.resolvedByMemberId, result })
          ]
        );
        wakeEvent = mapWakeEvent(wakeResult.rows[0]);
      }
    }

    const updatedMessage = await loadMessageById(client, message.id);
    const decisionEvent = await appendEvent(client, decisionBlock.workspaceId, "decision.resolved", "decision", decisionBlock.id, {
      decisionBlock,
      wakeEvent: wakeEvent ?? null
    });
    const messageEvent = await appendEvent(client, decisionBlock.workspaceId, "message.updated", "message", message.id, {
      message: updatedMessage
    });
    const wakeWorkspaceEvent = wakeEvent
      ? await appendEvent(client, decisionBlock.workspaceId, "wake.queued", "wake", wakeEvent.id, { wakeEvent })
      : null;
    await client.query("COMMIT");
    return {
      decisionBlock,
      message: updatedMessage,
      events: wakeWorkspaceEvent ? [decisionEvent, messageEvent, wakeWorkspaceEvent] : [decisionEvent, messageEvent],
      wakeEvent
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function loadMiraMonitor(
  client: SqlClient,
  workspaceId = seedWorkspace.id,
  viewerMemberId = seedMembers[0].id
): Promise<MiraMonitorSummary> {
  await getMemberKind(client, workspaceId, viewerMemberId);
  const stateResult = await client.query<MiraMonitorRow>(
    `
    SELECT id, workspace_id, agent_member_id, enabled, last_checked_at, last_error, created_at, updated_at
    FROM mira_monitor_states
    WHERE workspace_id = $1
    `,
    [workspaceId]
  );

  if (stateResult.rows.length === 0) {
    throw new ChatRepositoryError("Mira monitor is not configured for this workspace", 404);
  }

  const state = stateResult.rows[0];
  const activityResult = await client.query<MiraMonitorActivityRow>(
    `
    SELECT id, workspace_id, agent_member_id, event_kind, severity, summary, created_at
    FROM mira_monitor_events
    WHERE workspace_id = $1
      AND agent_member_id = $2
      AND created_at >= now() - interval '1 hour'
    ORDER BY created_at DESC, id DESC
    LIMIT 12
    `,
    [workspaceId, state.agent_member_id]
  );

  return mapMiraMonitor(state, activityResult.rows.map(mapMiraMonitorActivity));
}

export async function setMiraMonitorEnabled(
  client: SqlClient,
  workspaceId: string,
  viewerMemberId: string,
  enabled: boolean
): Promise<MiraMonitorMutationResult> {
  await getMemberKind(client, workspaceId, viewerMemberId);

  await client.query("BEGIN");
  try {
    const stateResult = await client.query<MiraMonitorRow>(
      `
      UPDATE mira_monitor_states
      SET enabled = $2,
        last_error = CASE WHEN $2 THEN last_error ELSE NULL END,
        last_checked_at = now(),
        updated_at = now()
      WHERE workspace_id = $1
      RETURNING id, workspace_id, agent_member_id, enabled, last_checked_at, last_error, created_at, updated_at
      `,
      [workspaceId, enabled]
    );

    if (stateResult.rows.length === 0) {
      throw new ChatRepositoryError("Mira monitor is not configured for this workspace", 404);
    }

    const state = stateResult.rows[0];
    await client.query(
      `
      UPDATE agent_profiles
      SET is_enabled = $3, updated_at = now()
      WHERE workspace_id = $1
        AND member_id = $2
      `,
      [workspaceId, state.agent_member_id, enabled]
    );
    await client.query(
      `
      UPDATE members
      SET presence_state = CASE WHEN $3 THEN 'idle'::presence_state ELSE 'offline'::presence_state END,
        updated_at = now()
      WHERE workspace_id = $1
        AND id = $2
      `,
      [workspaceId, state.agent_member_id, enabled]
    );

    if (!enabled) {
      await client.query(
        `
        UPDATE wake_events
        SET status = 'cancelled', updated_at = now()
        WHERE workspace_id = $1
          AND target_agent_member_id = $2
          AND status IN ('queued', 'coalescing', 'running')
        `,
        [workspaceId, state.agent_member_id]
      );
      await client.query(
        `
        UPDATE wake_batches
        SET status = 'cancelled', updated_at = now()
        WHERE workspace_id = $1
          AND target_agent_member_id = $2
          AND status IN ('queued', 'coalescing')
        `,
        [workspaceId, state.agent_member_id]
      );
      await client.query(
        `
        UPDATE agent_sessions
        SET state = 'cancelled',
          finished_at = COALESCE(finished_at, now()),
          updated_at = now()
        WHERE workspace_id = $1
          AND agent_member_id = $2
          AND state IN ('queued', 'running')
        `,
        [workspaceId, state.agent_member_id]
      );
    }

    const activityResult = await client.query<MiraMonitorActivityRow>(
      `
      SELECT id, workspace_id, agent_member_id, event_kind, severity, summary, created_at
      FROM mira_monitor_events
      WHERE workspace_id = $1
        AND agent_member_id = $2
        AND created_at >= now() - interval '1 hour'
      ORDER BY created_at DESC, id DESC
      LIMIT 12
      `,
      [workspaceId, state.agent_member_id]
    );
    const miraMonitor = mapMiraMonitor(state, activityResult.rows.map(mapMiraMonitorActivity));
    const event = await appendEvent(client, workspaceId, "mira.monitor.updated", "mira_monitor", state.id, {
      miraMonitor
    });
    await client.query("COMMIT");
    return { miraMonitor, events: [event] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function loadBootstrap(
  client: SqlClient,
  workspaceId = seedWorkspace.id,
  viewerMemberId = seedMembers[0].id
): Promise<BootstrapPayload> {
  const workspaceResult = await client.query<{
    id: string;
    slug: string;
    name: string;
  }>("SELECT id, slug, name FROM workspaces WHERE id = $1", [workspaceId]);

  if (workspaceResult.rows.length === 0) {
    throw new Error(`Workspace ${workspaceId} was not found`);
  }

  const memberResult = await client.query<{
    id: string;
    workspace_id: string;
    kind: MemberSummary["kind"];
    display_name: string;
    handle: string;
    role: string | null;
    presence_state: MemberSummary["presenceState"];
    is_enabled: boolean;
  }>(
    `
    SELECT
      members.id,
      members.workspace_id,
      members.kind,
      members.display_name,
      members.handle,
      members.role,
      members.presence_state,
      COALESCE(agent_profiles.is_enabled, true) AS is_enabled
    FROM members
    LEFT JOIN agent_profiles ON agent_profiles.member_id = members.id
      AND agent_profiles.workspace_id = members.workspace_id
    WHERE members.workspace_id = $1
    ORDER BY members.kind DESC, members.display_name ASC
    `,
    [workspaceId]
  );

  const roomResult = await client.query<{
    id: string;
    workspace_id: string;
    kind: RoomSummary["kind"];
    name: string;
    topic: string | null;
    member_ids: string[] | string;
  }>(
    `
    SELECT
      rooms.id,
      rooms.workspace_id,
      rooms.kind,
      rooms.name,
      rooms.topic,
      COALESCE(json_agg(room_memberships.member_id ORDER BY room_memberships.member_id), '[]') AS member_ids
    FROM rooms
    LEFT JOIN room_memberships ON room_memberships.room_id = rooms.id
    WHERE rooms.workspace_id = $1
    GROUP BY rooms.id
    ORDER BY rooms.kind ASC, rooms.name ASC
    `,
    [workspaceId]
  );

  const messageResult = await client.query<MessageRow>(
    `
    SELECT
      id,
      workspace_id,
      room_id,
      thread_id,
      parent_message_id,
      author_member_id,
      author_kind,
      body,
      body_format,
      blocks_json,
      mentions_json,
      source_client_id,
      edit_version,
      created_at,
      updated_at,
      deleted_at
    FROM messages
    WHERE workspace_id = $1
    ORDER BY created_at ASC
    `,
    [workspaceId]
  );

  const artifactResult = await client.query<ArtifactRow>(
    `
    SELECT
      id,
      workspace_id,
      thread_id,
      message_id,
      created_by_member_id,
      kind,
      title,
      mime_type,
      storage_key,
      external_url,
      preview_json,
      provenance_json,
      retention_policy,
      created_at,
      updated_at
    FROM artifacts
    WHERE workspace_id = $1
    ORDER BY created_at ASC
    `,
    [workspaceId]
  );

  const activityResult = await client.query<ActivityRow>(
    `
    WITH workspace_humans AS (
      SELECT id
      FROM members
      WHERE workspace_id = $1
        AND kind = 'human'
      ORDER BY display_name ASC
      LIMIT 1
    ),
    open_decisions AS (
      SELECT
        'decision:' || decision_blocks.id || ':open' AS id,
        decision_blocks.workspace_id,
        messages.room_id,
        decision_blocks.thread_id,
        'decision' AS subject_kind,
        decision_blocks.id AS subject_id,
        decision_blocks.created_by_agent_member_id AS actor_member_id,
        COALESCE($2::uuid, (SELECT id FROM workspace_humans)) AS action_owner_member_id,
        'action_needed' AS state,
        members.display_name || ' is waiting for ' || decision_blocks.title AS summary,
        decision_blocks.created_at AS sort_at
      FROM decision_blocks
      INNER JOIN messages ON messages.id = decision_blocks.message_id
      INNER JOIN members ON members.id = decision_blocks.created_by_agent_member_id
      WHERE decision_blocks.workspace_id = $1
        AND decision_blocks.status = 'open'
    ),
    resolved_decisions AS (
      SELECT
        'decision:' || decision_blocks.id || ':resolved' AS id,
        decision_blocks.workspace_id,
        messages.room_id,
        decision_blocks.thread_id,
        'decision' AS subject_kind,
        decision_blocks.id AS subject_id,
        decision_blocks.resolved_by_member_id AS actor_member_id,
        NULL::uuid AS action_owner_member_id,
        'recently_done' AS state,
        COALESCE(resolver.display_name, 'Workspace') || ' resolved ' || decision_blocks.title AS summary,
        COALESCE(decision_blocks.resolved_at, decision_blocks.updated_at) AS sort_at
      FROM decision_blocks
      INNER JOIN messages ON messages.id = decision_blocks.message_id
      LEFT JOIN members resolver ON resolver.id = decision_blocks.resolved_by_member_id
      WHERE decision_blocks.workspace_id = $1
        AND decision_blocks.status = 'resolved'
    ),
    artifact_events AS (
      SELECT
        'artifact:' || artifacts.id AS id,
        artifacts.workspace_id,
        COALESCE(messages.room_id, threads.room_id) AS room_id,
        artifacts.thread_id,
        'artifact' AS subject_kind,
        artifacts.id AS subject_id,
        artifacts.created_by_member_id AS actor_member_id,
        NULL::uuid AS action_owner_member_id,
        'recently_done' AS state,
        members.display_name || ' posted ' || artifacts.title AS summary,
        artifacts.created_at AS sort_at
      FROM artifacts
      LEFT JOIN messages ON messages.id = artifacts.message_id
      LEFT JOIN threads ON threads.id = artifacts.thread_id
      INNER JOIN members ON members.id = artifacts.created_by_member_id
      WHERE artifacts.workspace_id = $1
        AND COALESCE(messages.room_id, threads.room_id) IS NOT NULL
    ),
    session_events AS (
      SELECT
        'session:' || agent_sessions.id AS id,
        agent_sessions.workspace_id,
        agent_sessions.room_id,
        agent_sessions.thread_id,
        'session' AS subject_kind,
        agent_sessions.id AS subject_id,
        agent_sessions.agent_member_id AS actor_member_id,
        NULL::uuid AS action_owner_member_id,
        'recently_done' AS state,
        members.display_name || ' completed a session' AS summary,
        COALESCE(agent_sessions.finished_at, agent_sessions.updated_at) AS sort_at
      FROM agent_sessions
      INNER JOIN members ON members.id = agent_sessions.agent_member_id
      WHERE agent_sessions.workspace_id = $1
        AND agent_sessions.state = 'completed'
        AND agent_sessions.room_id IS NOT NULL
    ),
    thread_events AS (
      SELECT
        'thread:' || threads.id || ':done' AS id,
        threads.workspace_id,
        threads.room_id,
        threads.id AS thread_id,
        'thread' AS subject_kind,
        threads.id AS subject_id,
        NULL::uuid AS actor_member_id,
        NULL::uuid AS action_owner_member_id,
        'recently_done' AS state,
        'Thread marked done' AS summary,
        threads.last_activity_at AS sort_at
      FROM threads
      WHERE threads.workspace_id = $1
        AND threads.state = 'done'
    )
    SELECT *
    FROM (
      SELECT * FROM open_decisions
      UNION ALL SELECT * FROM resolved_decisions
      UNION ALL SELECT * FROM artifact_events
      UNION ALL SELECT * FROM session_events
      UNION ALL SELECT * FROM thread_events
    ) activity
    ORDER BY sort_at DESC, id DESC
    LIMIT 30
    `,
    [workspaceId, viewerMemberId]
  );

  const threadStateResult = await client.query<ThreadStateRow>(
    `
    WITH thread_facts AS (
      SELECT
        threads.id,
        threads.workspace_id,
        threads.room_id,
        threads.root_message_id,
        threads.state,
        threads.last_activity_at,
        EXISTS (
          SELECT 1
          FROM decision_blocks
          WHERE decision_blocks.thread_id = threads.id
            AND decision_blocks.status = 'open'
        ) AS has_open_decision,
        EXISTS (
          SELECT 1
          FROM agent_sessions
          WHERE agent_sessions.thread_id = threads.id
            AND agent_sessions.state IN ('queued', 'running')
        ) AS has_active_session,
        EXISTS (
          SELECT 1
          FROM artifacts
          WHERE artifacts.thread_id = threads.id
        ) AS has_artifact,
        EXISTS (
          SELECT 1
          FROM decision_blocks
          WHERE decision_blocks.thread_id = threads.id
            AND decision_blocks.status = 'resolved'
        ) AS has_resolved_decision,
        (
          SELECT agent_sessions.agent_member_id
          FROM agent_sessions
          WHERE agent_sessions.thread_id = threads.id
          ORDER BY COALESCE(agent_sessions.last_output_at, agent_sessions.started_at, agent_sessions.updated_at) DESC
          LIMIT 1
        ) AS session_actor_member_id,
        (
          SELECT decision_blocks.created_by_agent_member_id
          FROM decision_blocks
          WHERE decision_blocks.thread_id = threads.id
          ORDER BY decision_blocks.created_at DESC
          LIMIT 1
        ) AS decision_actor_member_id,
        (
          SELECT artifacts.created_by_member_id
          FROM artifacts
          WHERE artifacts.thread_id = threads.id
          ORDER BY artifacts.created_at DESC
          LIMIT 1
        ) AS artifact_actor_member_id
      FROM threads
      WHERE threads.workspace_id = $1
    )
    SELECT
      id,
      workspace_id,
      room_id,
      root_message_id,
      CASE
        WHEN has_open_decision THEN 'waiting'
        WHEN has_active_session THEN 'working'
        WHEN state = 'done' OR has_artifact OR has_resolved_decision THEN 'done'
        ELSE state
      END AS status,
      COALESCE(session_actor_member_id, decision_actor_member_id, artifact_actor_member_id) AS actor_member_id,
      last_activity_at
    FROM thread_facts
    ORDER BY last_activity_at DESC, id DESC
    `,
    [workspaceId]
  );

  const activePresenceResult = await client.query<{
    member_id: string;
    derived_presence_state: MemberSummary["presenceState"];
  }>(
    `
    WITH active_sessions AS (
      SELECT DISTINCT agent_member_id
      FROM agent_sessions
      WHERE workspace_id = $1
        AND state IN ('queued', 'running')
    ),
    waiting_decisions AS (
      SELECT DISTINCT created_by_agent_member_id
      FROM decision_blocks
      WHERE workspace_id = $1
        AND status = 'open'
    )
    SELECT
      members.id AS member_id,
      CASE
        WHEN agent_profiles.is_enabled = false THEN 'offline'
        WHEN active_sessions.agent_member_id IS NOT NULL THEN 'working'
        WHEN waiting_decisions.created_by_agent_member_id IS NOT NULL THEN 'waiting'
        ELSE members.presence_state
      END AS derived_presence_state
    FROM members
    LEFT JOIN agent_profiles ON agent_profiles.member_id = members.id
      AND agent_profiles.workspace_id = members.workspace_id
    LEFT JOIN active_sessions ON active_sessions.agent_member_id = members.id
    LEFT JOIN waiting_decisions ON waiting_decisions.created_by_agent_member_id = members.id
    WHERE members.workspace_id = $1
    `,
    [workspaceId]
  );
  const derivedPresenceByMember = new Map(
    activePresenceResult.rows.map((row) => [row.member_id, row.derived_presence_state])
  );

  const workspace: WorkspaceSummary = workspaceResult.rows[0];
  const members: MemberSummary[] = memberResult.rows.map((member) => ({
    id: member.id,
    workspaceId: member.workspace_id,
    kind: member.kind,
    displayName: member.display_name,
    handle: member.handle,
    role: member.role,
    presenceState: derivedPresenceByMember.get(member.id) ?? member.presence_state,
    isEnabled: member.is_enabled
  }));
  const rooms: RoomSummary[] = roomResult.rows.map((room) => ({
    id: room.id,
    workspaceId: room.workspace_id,
    kind: room.kind,
    name: room.name,
    topic: room.topic,
    unreadCount: room.name === "design-review" ? 2 : room.name === "Tau" ? 1 : 0,
    memberIds: Array.isArray(room.member_ids) ? room.member_ids : (JSON.parse(room.member_ids) as string[])
  }));
  const messages: MessageSummary[] = messageResult.rows.map(mapMessage);
  const artifacts: ArtifactSummary[] = artifactResult.rows.map(mapArtifact);
  const activity: ActivitySummary[] = activityResult.rows.map(mapActivity);
  const threadStates: ThreadStateSummary[] = threadStateResult.rows.map(mapThreadState);
  const miraMonitor = await loadMiraMonitor(client, workspaceId, viewerMemberId);

  return { workspace, members, rooms, messages, artifacts, activity, threadStates, miraMonitor, eventToken: DEV_EVENT_TOKEN };
}

export async function listRoomsForMember(
  client: SqlClient,
  workspaceId: string,
  memberId: string
): Promise<RoomSummary[]> {
  await getMemberKind(client, workspaceId, memberId);
  const result = await client.query<{
    id: string;
    workspace_id: string;
    kind: RoomSummary["kind"];
    name: string;
    topic: string | null;
    member_ids: string[] | string;
  }>(
    `
    SELECT
      rooms.id,
      rooms.workspace_id,
      rooms.kind,
      rooms.name,
      rooms.topic,
      COALESCE(json_agg(room_memberships.member_id ORDER BY room_memberships.member_id), '[]') AS member_ids
    FROM rooms
    INNER JOIN room_memberships viewer_membership
      ON viewer_membership.room_id = rooms.id
      AND viewer_membership.member_id = $2
      AND viewer_membership.archived_at IS NULL
    LEFT JOIN room_memberships ON room_memberships.room_id = rooms.id AND room_memberships.archived_at IS NULL
    WHERE rooms.workspace_id = $1
      AND rooms.archived_at IS NULL
      AND (
        rooms.kind = 'channel'
        OR EXISTS (
          SELECT 1 FROM dm_participants
          WHERE dm_participants.room_id = rooms.id
            AND dm_participants.member_id = $2
        )
      )
    GROUP BY rooms.id
    ORDER BY rooms.kind ASC, rooms.name ASC
    `,
    [workspaceId, memberId]
  );
  return result.rows.map((room) => ({
    id: room.id,
    workspaceId: room.workspace_id,
    kind: room.kind,
    name: room.name,
    topic: room.topic,
    unreadCount: 0,
    memberIds: Array.isArray(room.member_ids) ? room.member_ids.map(String) : (JSON.parse(room.member_ids) as string[])
  }));
}

export async function listMembersForMember(
  client: SqlClient,
  workspaceId: string,
  memberId: string
): Promise<MemberSummary[]> {
  await getMemberKind(client, workspaceId, memberId);
  const result = await client.query<{
    id: string;
    workspace_id: string;
    kind: MemberSummary["kind"];
    display_name: string;
    handle: string;
    role: string | null;
    presence_state: MemberSummary["presenceState"];
    is_enabled: boolean;
  }>(
    `
    SELECT
      members.id,
      members.workspace_id,
      members.kind,
      members.display_name,
      members.handle,
      members.role,
      members.presence_state,
      COALESCE(agent_profiles.is_enabled, true) AS is_enabled
    FROM members
    LEFT JOIN agent_profiles ON agent_profiles.member_id = members.id
      AND agent_profiles.workspace_id = members.workspace_id
    WHERE members.workspace_id = $1
    ORDER BY members.kind DESC, members.display_name ASC
    `,
    [workspaceId]
  );
  return result.rows.map((member) => ({
    id: member.id,
    workspaceId: member.workspace_id,
    kind: member.kind,
    displayName: member.display_name,
    handle: member.handle,
    role: member.role,
    presenceState: member.is_enabled ? member.presence_state : "offline",
    isEnabled: member.is_enabled
  }));
}

export async function listRoomMessages(
  client: SqlClient,
  roomId: string,
  memberId: string,
  opts: { workspaceId?: string; before?: string; limit?: number } = {}
): Promise<MessageSummary[]> {
  const room = await getVisibleRoom(client, roomId, memberId, opts.workspaceId);
  const result = await client.query<MessageRow>(
    `
    SELECT
      id,
      workspace_id,
      room_id,
      thread_id,
      parent_message_id,
      author_member_id,
      author_kind,
      body,
      body_format,
      blocks_json,
      mentions_json,
      source_client_id,
      edit_version,
      created_at,
      updated_at,
      deleted_at
    FROM messages
    WHERE workspace_id = $1
      AND room_id = $2
      AND parent_message_id IS NULL
      AND ($3::timestamptz IS NULL OR created_at < $3::timestamptz)
    ORDER BY created_at DESC, id DESC
    LIMIT $4
    `,
    [room.workspace_id, roomId, opts.before ?? null, opts.limit ?? 50]
  );
  return result.rows.reverse().map(mapMessage);
}

export async function listThreadMessages(
  client: SqlClient,
  threadId: string,
  memberId: string,
  opts: { before?: string; limit?: number } = {}
): Promise<MessageSummary[]> {
  const thread = await getVisibleThread(client, threadId, memberId);
  const result = await client.query<MessageRow>(
    `
    SELECT
      id,
      workspace_id,
      room_id,
      thread_id,
      parent_message_id,
      author_member_id,
      author_kind,
      body,
      body_format,
      blocks_json,
      mentions_json,
      source_client_id,
      edit_version,
      created_at,
      updated_at,
      deleted_at
    FROM messages
    WHERE workspace_id = $1
      AND thread_id = $2
      AND ($3::timestamptz IS NULL OR created_at < $3::timestamptz)
    ORDER BY created_at DESC, id DESC
    LIMIT $4
    `,
    [thread.workspace_id, threadId, opts.before ?? null, opts.limit ?? 50]
  );
  return result.rows.reverse().map(mapMessage);
}

export async function listArtifactsForMember(
  client: SqlClient,
  workspaceId: string,
  memberId: string,
  opts: { messageId?: string; threadId?: string; limit?: number } = {}
): Promise<ArtifactSummary[]> {
  await getMemberKind(client, workspaceId, memberId);
  if (opts.messageId) {
    const message = await getVisibleMessage(client, opts.messageId, memberId);
    if (message.workspaceId !== workspaceId) {
      throw new ChatRepositoryError("Message is not part of this workspace", 404);
    }
  }
  if (opts.threadId) {
    const thread = await getVisibleThread(client, opts.threadId, memberId);
    if (thread.workspace_id !== workspaceId) {
      throw new ChatRepositoryError("Thread is not part of this workspace", 404);
    }
  }

  const result = await client.query<ArtifactRow>(
    `
    SELECT
      artifacts.id,
      artifacts.workspace_id,
      artifacts.thread_id,
      artifacts.message_id,
      artifacts.created_by_member_id,
      artifacts.kind,
      artifacts.title,
      artifacts.mime_type,
      artifacts.storage_key,
      artifacts.external_url,
      artifacts.preview_json,
      artifacts.provenance_json,
      artifacts.retention_policy,
      artifacts.created_at,
      artifacts.updated_at
    FROM artifacts
    LEFT JOIN messages ON messages.id = artifacts.message_id
    LEFT JOIN threads ON threads.id = artifacts.thread_id
    INNER JOIN room_memberships
      ON room_memberships.room_id = COALESCE(messages.room_id, threads.room_id)
      AND room_memberships.member_id = $2
      AND room_memberships.archived_at IS NULL
    WHERE artifacts.workspace_id = $1
      AND ($3::uuid IS NULL OR artifacts.message_id = $3::uuid)
      AND ($4::uuid IS NULL OR artifacts.thread_id = $4::uuid)
      AND (
        EXISTS (
          SELECT 1
          FROM rooms
          WHERE rooms.id = COALESCE(messages.room_id, threads.room_id)
            AND rooms.kind = 'channel'
            AND rooms.archived_at IS NULL
        )
        OR EXISTS (
          SELECT 1 FROM dm_participants
          WHERE dm_participants.room_id = COALESCE(messages.room_id, threads.room_id)
            AND dm_participants.member_id = $2
        )
      )
    ORDER BY artifacts.created_at DESC, artifacts.id DESC
    LIMIT $5
    `,
    [workspaceId, memberId, opts.messageId ?? null, opts.threadId ?? null, opts.limit ?? 100]
  );
  return result.rows.map(mapArtifact);
}

export async function createArtifact(client: SqlClient, input: CreateArtifactInput): Promise<ArtifactMutationResult> {
  const kind = toArtifactKind(input.kind);
  const title = cleanText(input.title, 180);
  if (!title) {
    throw new ChatRepositoryError("Artifact title is required", 422);
  }
  if (!input.messageId && !input.threadId) {
    throw new ChatRepositoryError("Artifact must be attached to a message or thread", 422);
  }

  let workspaceId = input.workspaceId;
  let threadId = input.threadId ?? null;
  let roomId: string | null = null;

  if (input.messageId) {
    const message = await getVisibleMessage(client, input.messageId, input.createdByMemberId);
    workspaceId = workspaceId ?? message.workspaceId;
    if (workspaceId !== message.workspaceId) {
      throw new ChatRepositoryError("Message is not part of this workspace", 404);
    }
    threadId = threadId ?? message.threadId;
    roomId = message.roomId;
  }

  if (input.threadId) {
    const thread = await getVisibleThread(client, input.threadId, input.createdByMemberId);
    workspaceId = workspaceId ?? thread.workspace_id;
    if (workspaceId !== thread.workspace_id) {
      throw new ChatRepositoryError("Thread is not part of this workspace", 404);
    }
    roomId = thread.room_id;
  }

  if (!workspaceId || !roomId) {
    throw new ChatRepositoryError("Artifact target is not visible", 403);
  }
  await getMemberKind(client, workspaceId, input.createdByMemberId);

  const externalUrl = cleanUrl(input.externalUrl) ?? null;
  const preview = sanitizePreview(kind, input.preview ?? {}, externalUrl);
  const provenance = sanitizeProvenance(input.provenance ?? {});
  const artifactId = randomUUID();

  await client.query("BEGIN");
  try {
    await client.query(
      `
      INSERT INTO artifacts(
        id,
        workspace_id,
        thread_id,
        message_id,
        created_by_member_id,
        kind,
        title,
        mime_type,
        storage_key,
        external_url,
        preview_json,
        provenance_json,
        retention_policy
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13)
      `,
      [
        artifactId,
        workspaceId,
        threadId,
        input.messageId ?? null,
        input.createdByMemberId,
        kind,
        title,
        cleanNullableText(input.mimeType, 120),
        cleanNullableText(input.storageKey, 512),
        externalUrl,
        JSON.stringify(preview),
        JSON.stringify(provenance),
        cleanText(input.retentionPolicy, 80) ?? "workspace"
      ]
    );
    await client.query(
      `
      INSERT INTO artifact_versions(id, workspace_id, artifact_id, version_number, storage_key, metadata_json)
      VALUES ($1, $2, $3, 1, $4, $5::jsonb)
      `,
      [
        randomUUID(),
        workspaceId,
        artifactId,
        cleanNullableText(input.storageKey, 512),
        JSON.stringify({ kind, title, mimeType: cleanNullableText(input.mimeType, 120), preview })
      ]
    );
    const artifact = await loadArtifactById(client, artifactId);
    const event = await appendEvent(client, workspaceId, "artifact.created", "artifact", artifactId, { artifact });
    await client.query("COMMIT");
    return { artifact, events: [event] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function sendRoomMessage(client: SqlClient, input: SendMessageInput): Promise<ChatMutationResult> {
  if (input.body.trim().length === 0) {
    throw new ChatRepositoryError("Message body is required", 422);
  }
  const room = await getVisibleRoom(client, input.roomId, input.authorMemberId, input.workspaceId);
  const existing = await findMessageBySourceClientId(client, room.workspace_id, room.id, input.sourceClientId);
  if (existing) {
    return { message: existing, events: [], idempotent: true };
  }

  await client.query("BEGIN");
  try {
    const authorKind = await getMemberKind(client, room.workspace_id, input.authorMemberId);
    const messageId = randomUUID();
    await client.query(
      `
      INSERT INTO messages(
        id,
        workspace_id,
        room_id,
        author_member_id,
        author_kind,
        body,
        body_format,
        blocks_json,
        mentions_json,
        source_client_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)
      `,
      [
        messageId,
        room.workspace_id,
        room.id,
        input.authorMemberId,
        authorKind,
        input.body,
        input.bodyFormat ?? "plain",
        JSON.stringify(input.blocks ?? []),
        JSON.stringify(input.mentions ?? []),
        input.sourceClientId ?? null
      ]
    );
    await client.query("UPDATE rooms SET last_message_id = $2, updated_at = now() WHERE id = $1", [room.id, messageId]);
    const message = await loadMessageById(client, messageId);
    const event = await appendEvent(client, room.workspace_id, "message.created", "message", messageId, { message });
    const routing = await routeMessageToAgents(
      client,
      { id: room.id, kind: room.kind, workspaceId: room.workspace_id },
      message,
      authorKind,
      input.mentions ?? []
    );
    await client.query("COMMIT");
    return { message, events: [event, ...routing.events] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function sendThreadReply(client: SqlClient, input: ReplyInput): Promise<ChatMutationResult> {
  if (input.body.trim().length === 0) {
    throw new ChatRepositoryError("Message body is required", 422);
  }
  const parent = await getVisibleMessage(client, input.parentMessageId, input.authorMemberId);
  if (parent.deletedAt) {
    throw new ChatRepositoryError("Cannot reply to a deleted message", 422);
  }
  const room = await getVisibleRoom(client, parent.roomId, input.authorMemberId, parent.workspaceId);
  const existing = await findMessageBySourceClientId(client, parent.workspaceId, parent.roomId, input.sourceClientId);
  if (existing) {
    return { message: existing, events: [], idempotent: true };
  }

  await client.query("BEGIN");
  try {
    const authorKind = await getMemberKind(client, parent.workspaceId, input.authorMemberId);
    const threadResult = await client.query<{ id: string }>(
      "SELECT id FROM threads WHERE workspace_id = $1 AND root_message_id = $2",
      [parent.workspaceId, parent.threadId ? parent.parentMessageId ?? parent.id : parent.id]
    );
    const threadId = threadResult.rows[0]?.id ?? randomUUID();
    if (threadResult.rows.length === 0) {
      await client.query(
        `
        INSERT INTO threads(id, workspace_id, room_id, root_message_id, state)
        VALUES ($1, $2, $3, $4, 'working')
        `,
        [threadId, parent.workspaceId, parent.roomId, parent.id]
      );
    }

    const messageId = randomUUID();
    await client.query(
      `
      INSERT INTO messages(
        id,
        workspace_id,
        room_id,
        thread_id,
        parent_message_id,
        author_member_id,
        author_kind,
        body,
        body_format,
        blocks_json,
        mentions_json,
        source_client_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12)
      `,
      [
        messageId,
        parent.workspaceId,
        parent.roomId,
        threadId,
        parent.threadId ? parent.parentMessageId ?? parent.id : parent.id,
        input.authorMemberId,
        authorKind,
        input.body,
        input.bodyFormat ?? "plain",
        JSON.stringify(input.blocks ?? []),
        JSON.stringify(input.mentions ?? []),
        input.sourceClientId ?? null
      ]
    );
    await client.query("UPDATE rooms SET last_message_id = $2, updated_at = now() WHERE id = $1", [room.id, messageId]);
    const thread = await updateThreadActivity(client, threadId, messageId);
    const message = await loadMessageById(client, messageId);
    const messageEvent = await appendEvent(client, parent.workspaceId, "message.created", "message", messageId, {
      message
    });
    const threadEvent = await appendEvent(client, parent.workspaceId, "thread.updated", "thread", threadId, {
      thread: {
        id: thread.id,
        workspaceId: thread.workspace_id,
        roomId: thread.room_id,
        lastMessageId: messageId,
        lastActivityAt: iso(thread.last_activity_at)
      }
    });
    const routing = await routeMessageToAgents(
      client,
      { id: room.id, kind: room.kind, workspaceId: room.workspace_id },
      message,
      authorKind,
      input.mentions ?? []
    );
    await client.query("COMMIT");
    return { message, events: [messageEvent, threadEvent, ...routing.events] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function editMessage(client: SqlClient, input: EditMessageInput): Promise<ChatMutationResult> {
  const message = await getVisibleMessage(client, input.messageId, input.editorMemberId);
  if (message.deletedAt) {
    throw new ChatRepositoryError("Cannot edit a deleted message", 422);
  }
  if (message.authorMemberId !== input.editorMemberId) {
    throw new ChatRepositoryError("Only the author can edit this message", 403);
  }
  if (input.body.trim().length === 0) {
    throw new ChatRepositoryError("Message body is required", 422);
  }

  await client.query("BEGIN");
  try {
    await client.query(
      `
      INSERT INTO message_revisions(id, workspace_id, message_id, revision_number, body, blocks_json, edited_by_member_id)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
      `,
      [
        randomUUID(),
        message.workspaceId,
        message.id,
        message.editVersion,
        message.body,
        JSON.stringify(message.blocks),
        input.editorMemberId
      ]
    );
    await client.query(
      `
      UPDATE messages
      SET body = $2,
        blocks_json = $3::jsonb,
        mentions_json = $4::jsonb,
        edit_version = edit_version + 1,
        updated_at = now()
      WHERE id = $1
      `,
      [
        message.id,
        input.body,
        JSON.stringify(input.blocks ?? message.blocks),
        JSON.stringify(input.mentions ?? message.mentions)
      ]
    );
    const updated = await loadMessageById(client, message.id);
    const events = [
      await appendEvent(client, updated.workspaceId, "message.updated", "message", updated.id, { message: updated })
    ];
    if (updated.threadId) {
      const thread = await updateThreadActivity(client, updated.threadId, updated.id);
      events.push(
        await appendEvent(client, updated.workspaceId, "thread.updated", "thread", updated.threadId, {
          thread: {
            id: thread.id,
            workspaceId: thread.workspace_id,
            roomId: thread.room_id,
            lastMessageId: updated.id,
            lastActivityAt: iso(thread.last_activity_at)
          }
        })
      );
    }
    await client.query("COMMIT");
    return { message: updated, events };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function deleteMessage(client: SqlClient, input: DeleteMessageInput): Promise<ChatMutationResult> {
  const message = await getVisibleMessage(client, input.messageId, input.deletedByMemberId);
  if (message.authorMemberId !== input.deletedByMemberId) {
    throw new ChatRepositoryError("Only the author can delete this message", 403);
  }

  await client.query("BEGIN");
  try {
    if (!message.deletedAt) {
      await client.query(
        `
        INSERT INTO message_tombstones(id, workspace_id, message_id, deleted_by_member_id, reason)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (message_id) DO NOTHING
        `,
        [randomUUID(), message.workspaceId, message.id, input.deletedByMemberId, input.reason ?? null]
      );
      await client.query(
        `
        UPDATE messages
        SET body = '',
          blocks_json = '[]'::jsonb,
          mentions_json = '[]'::jsonb,
          deleted_at = now(),
          updated_at = now()
        WHERE id = $1
        `,
        [message.id]
      );
    }

    const deleted = await loadMessageById(client, message.id);
    const events = [
      await appendEvent(client, deleted.workspaceId, "message.deleted", "message", deleted.id, { message: deleted })
    ];
    if (deleted.threadId) {
      const thread = await updateThreadActivity(client, deleted.threadId, deleted.id);
      events.push(
        await appendEvent(client, deleted.workspaceId, "thread.updated", "thread", deleted.threadId, {
          thread: {
            id: thread.id,
            workspaceId: thread.workspace_id,
            roomId: thread.room_id,
            lastMessageId: deleted.id,
            lastActivityAt: iso(thread.last_activity_at)
          }
        })
      );
    }
    await client.query("COMMIT");
    return { message: deleted, events };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
