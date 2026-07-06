import type {
  ActivitySummary,
  BootstrapPayload,
  MemberSummary,
  MessageSummary,
  RoomSummary,
  WorkspaceSummary
} from "../shared/types.js";
import { DEV_EVENT_TOKEN, seedWorkspace } from "../shared/seed-data.js";
import type { SqlClient } from "../db/runtime.js";

type JsonValue = string | unknown[] | Record<string, unknown> | null;

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

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
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

  const messageResult = await client.query<{
    id: string;
    workspace_id: string;
    room_id: string;
    thread_id: string | null;
    author_member_id: string;
    author_kind: MessageSummary["authorKind"];
    body: string;
    body_format: MessageSummary["bodyFormat"];
    blocks_json: JsonValue;
    mentions_json: JsonValue;
    created_at: Date | string;
  }>(
    `
    SELECT
      id,
      workspace_id,
      room_id,
      thread_id,
      author_member_id,
      author_kind,
      body,
      body_format,
      blocks_json,
      mentions_json,
      created_at
    FROM messages
    WHERE workspace_id = $1 AND deleted_at IS NULL
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
  const messages: MessageSummary[] = messageResult.rows.map((message) => ({
    id: message.id,
    workspaceId: message.workspace_id,
    roomId: message.room_id,
    threadId: message.thread_id,
    authorMemberId: message.author_member_id,
    authorKind: message.author_kind,
    body: message.body,
    bodyFormat: message.body_format,
    blocks: parseJsonArray(message.blocks_json),
    mentions: parseStringArray(message.mentions_json),
    createdAt: iso(message.created_at)
  }));
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
