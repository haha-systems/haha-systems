import { randomUUID } from "node:crypto";
import type {
  ActivitySummary,
  BootstrapPayload,
  MemberSummary,
  MessageSummary,
  RoomSummary,
  WorkspaceEvent,
  WorkspaceSummary
} from "../shared/types.js";
import { DEV_EVENT_TOKEN, seedWorkspace } from "../shared/seed-data.js";
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

export interface ChatMutationResult {
  message: MessageSummary;
  events: WorkspaceEvent[];
  idempotent?: boolean;
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

export async function loadBootstrap(client: SqlClient, workspaceId = seedWorkspace.id): Promise<BootstrapPayload> {
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
  }>(
    `
    SELECT id, workspace_id, kind, display_name, handle, role, presence_state
    FROM members
    WHERE workspace_id = $1
    ORDER BY kind DESC, display_name ASC
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

  const activityResult = await client.query<{
    id: string;
    workspace_id: string;
    room_id: string;
    thread_id: string | null;
    subject_kind: ActivitySummary["subjectKind"];
    subject_id: string;
    actor_member_id: string | null;
    state: ActivitySummary["state"];
    summary: string;
    sort_at: Date | string;
  }>(
    `
    SELECT id, workspace_id, room_id, thread_id, subject_kind, subject_id, actor_member_id, state, summary, sort_at
    FROM activity_items
    WHERE workspace_id = $1
    ORDER BY sort_at DESC
    `,
    [workspaceId]
  );

  const workspace: WorkspaceSummary = workspaceResult.rows[0];
  const members: MemberSummary[] = memberResult.rows.map((member) => ({
    id: member.id,
    workspaceId: member.workspace_id,
    kind: member.kind,
    displayName: member.display_name,
    handle: member.handle,
    role: member.role,
    presenceState: member.presence_state
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
  const activity: ActivitySummary[] = activityResult.rows.map((item) => ({
    id: item.id,
    workspaceId: item.workspace_id,
    roomId: item.room_id,
    threadId: item.thread_id,
    subjectKind: item.subject_kind,
    subjectId: item.subject_id,
    actorMemberId: item.actor_member_id,
    state: item.state,
    summary: item.summary,
    sortAt: iso(item.sort_at)
  }));

  return { workspace, members, rooms, messages, activity, eventToken: DEV_EVENT_TOKEN };
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
  }>(
    `
    SELECT id, workspace_id, kind, display_name, handle, role, presence_state
    FROM members
    WHERE workspace_id = $1
    ORDER BY kind DESC, display_name ASC
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
    presenceState: member.presence_state
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
  const thread = await client.query<{ id: string; room_id: string; workspace_id: string; root_message_id: string | null }>(
    "SELECT id, room_id, workspace_id, root_message_id FROM threads WHERE id = $1",
    [threadId]
  );
  if (thread.rows.length === 0) {
    throw new ChatRepositoryError("Thread was not found", 404);
  }
  await getVisibleRoom(client, thread.rows[0].room_id, memberId, thread.rows[0].workspace_id);
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
    [thread.rows[0].workspace_id, threadId, opts.before ?? null, opts.limit ?? 50]
  );
  return result.rows.reverse().map(mapMessage);
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
    await client.query("COMMIT");
    return { message, events: [event] };
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
    await client.query("UPDATE rooms SET last_message_id = $2, updated_at = now() WHERE id = $1", [
      parent.roomId,
      messageId
    ]);
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
    await client.query("COMMIT");
    return { message, events: [messageEvent, threadEvent] };
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
