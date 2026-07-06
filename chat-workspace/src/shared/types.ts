export type PresenceState = "idle" | "working" | "waiting" | "offline";
export type ThreadStatus = "working" | "waiting" | "done";
export type MemberKind = "human" | "agent";
export type RoomKind = "channel" | "dm";
export type ArtifactKind = "markdown" | "link" | "file" | "image";

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
  isEnabled: boolean;
}

export interface AgentProfileSummary {
  id: string;
  workspaceId: string;
  memberId: string;
  adapterType: string;
  model: string;
  instructionsRef: string | null;
  capabilities: Record<string, unknown>;
  budgetPolicy: Record<string, unknown>;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgentSummary {
  member: MemberSummary;
  profile: AgentProfileSummary;
  dmRoomId: string | null;
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

export type DecisionBlockKind = "approve_reject" | "short_question" | "pick_one";
export type DecisionBlockStatus = "open" | "resolved" | "expired";

export interface DecisionBlockSummary {
  id: string;
  workspaceId: string;
  messageId: string;
  threadId: string | null;
  createdByAgentMemberId: string;
  kind: DecisionBlockKind;
  title: string;
  prompt: string;
  schema: Record<string, unknown>;
  status: DecisionBlockStatus;
  idempotencyKey: string;
  expiresAt: string | null;
  resolvedByMemberId: string | null;
  result: Record<string, unknown> | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WakeEventSummary {
  id: string;
  workspaceId: string;
  roomId: string | null;
  threadId: string | null;
  triggerKind: string;
  triggerMessageId: string | null;
  triggerDecisionBlockId: string | null;
  targetAgentMemberId: string;
  routingPolicyVersion: string;
  dedupeKey: string;
  status: "queued" | "coalescing" | "running" | "completed" | "cancelled" | "failed";
  reason: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ArtifactPreview {
  excerpt?: string;
  description?: string;
  url?: string;
  imageUrl?: string;
  fileName?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  altText?: string;
}

export interface ArtifactSummary {
  id: string;
  workspaceId: string;
  threadId: string | null;
  messageId: string | null;
  createdByMemberId: string;
  kind: ArtifactKind;
  title: string;
  mimeType: string | null;
  storageKey: string | null;
  externalUrl: string | null;
  preview: ArtifactPreview;
  provenance: Record<string, string | number | boolean | null>;
  retentionPolicy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivitySummary {
  id: string;
  workspaceId: string;
  roomId: string;
  threadId: string | null;
  subjectKind: "decision" | "artifact" | "thread" | "session";
  subjectId: string;
  actorMemberId: string | null;
  actionOwnerMemberId: string | null;
  state: "action_needed" | "recently_done" | "working";
  summary: string;
  sortAt: string;
}

export type MiraMonitorHealth = "active" | "empty" | "disabled" | "error";

export interface MiraMonitorActivitySummary {
  id: string;
  kind: "check" | "action" | "note";
  summary: string;
  severity: "info" | "warning" | "error";
  createdAt: string;
}

export interface MiraMonitorSummary {
  workspaceId: string;
  agentMemberId: string;
  enabled: boolean;
  health: MiraMonitorHealth;
  lastCheckedAt: string | null;
  errorMessage: string | null;
  lastHourActivity: MiraMonitorActivitySummary[];
  updatedAt: string;
}

export interface ThreadStateSummary {
  id: string;
  workspaceId: string;
  roomId: string;
  rootMessageId: string | null;
  status: ThreadStatus;
  actorMemberId: string | null;
  lastActivityAt: string;
}

export interface BootstrapPayload {
  workspace: WorkspaceSummary;
  members: MemberSummary[];
  rooms: RoomSummary[];
  messages: MessageSummary[];
  artifacts: ArtifactSummary[];
  activity: ActivitySummary[];
  threadStates: ThreadStateSummary[];
  miraMonitor: MiraMonitorSummary;
  eventToken: string;
}

export interface WorkspaceEvent {
  workspaceId: string;
  sequence: number;
  type: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}
