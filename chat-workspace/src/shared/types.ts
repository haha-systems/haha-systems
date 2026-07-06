export type PresenceState = "idle" | "working" | "waiting" | "offline";
export type MemberKind = "human" | "agent";
export type RoomKind = "channel" | "dm";

export interface WorkspaceSummary {
  id: string;
  slug: string;
  name: string;
}

export interface MemberSummary {
  id: string;
  workspaceId: string;
  kind: MemberKind;
  displayName: string;
  handle: string;
  role: string | null;
  presenceState: PresenceState;
}

export interface RoomSummary {
  id: string;
  workspaceId: string;
  kind: RoomKind;
  name: string;
  topic: string | null;
  unreadCount: number;
  memberIds: string[];
}

export interface MessageSummary {
  id: string;
  workspaceId: string;
  roomId: string;
  threadId: string | null;
  parentMessageId: string | null;
  authorMemberId: string;
  authorKind: MemberKind;
  body: string;
  bodyFormat: "plain" | "markdown";
  blocks: Array<Record<string, unknown>>;
  mentions: string[];
  sourceClientId: string | null;
  editVersion: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ActivitySummary {
  id: string;
  workspaceId: string;
  roomId: string;
  threadId: string | null;
  subjectKind: "decision" | "artifact" | "thread";
  subjectId: string;
  actorMemberId: string | null;
  state: "action_needed" | "recently_done" | "working";
  summary: string;
  sortAt: string;
}

export interface BootstrapPayload {
  workspace: WorkspaceSummary;
  members: MemberSummary[];
  rooms: RoomSummary[];
  messages: MessageSummary[];
  activity: ActivitySummary[];
  eventToken: string;
}

export interface WorkspaceEvent {
  workspaceId: string;
  sequence: number;
  type: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}
