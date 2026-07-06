import type {
  ActivitySummary,
  MemberSummary,
  MessageSummary,
  RoomSummary,
  WorkspaceSummary
} from "./types.js";

export const DEV_EVENT_TOKEN = "dev-workspace-token";

export const seedWorkspace: WorkspaceSummary = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "mira-lab",
  name: "Mira Lab"
};

export const seedMembers: MemberSummary[] = [
  {
    id: "22222222-2222-4222-8222-222222222201",
    workspaceId: seedWorkspace.id,
    kind: "human",
    displayName: "Mira",
    handle: "mira",
    role: "You",
    presenceState: "idle"
  },
  {
    id: "22222222-2222-4222-8222-222222222202",
    workspaceId: seedWorkspace.id,
    kind: "agent",
    displayName: "Ari",
    handle: "ari",
    role: "Designer",
    presenceState: "working"
  },
  {
    id: "22222222-2222-4222-8222-222222222203",
    workspaceId: seedWorkspace.id,
    kind: "agent",
    displayName: "Tau",
    handle: "tau",
    role: "Engineer",
    presenceState: "idle"
  },
  {
    id: "22222222-2222-4222-8222-222222222204",
    workspaceId: seedWorkspace.id,
    kind: "agent",
    displayName: "Atlas",
    handle: "atlas",
    role: "Lead",
    presenceState: "waiting"
  }
];

export const seedRooms: RoomSummary[] = [
  {
    id: "33333333-3333-4333-8333-333333333301",
    workspaceId: seedWorkspace.id,
    kind: "channel",
    name: "design-review",
    topic: "Launch work, artifacts, and decisions",
    unreadCount: 2,
    memberIds: seedMembers.map((member) => member.id)
  },
  {
    id: "33333333-3333-4333-8333-333333333302",
    workspaceId: seedWorkspace.id,
    kind: "channel",
    name: "eng-sync",
    topic: "Architecture notes and implementation handoffs",
    unreadCount: 0,
    memberIds: [seedMembers[0].id, seedMembers[2].id, seedMembers[3].id]
  },
  {
    id: "33333333-3333-4333-8333-333333333303",
    workspaceId: seedWorkspace.id,
    kind: "dm",
    name: "Ari",
    topic: "1:1 with Ari",
    unreadCount: 0,
    memberIds: [seedMembers[0].id, seedMembers[1].id]
  },
  {
    id: "33333333-3333-4333-8333-333333333304",
    workspaceId: seedWorkspace.id,
    kind: "dm",
    name: "Tau",
    topic: "1:1 with Tau",
    unreadCount: 1,
    memberIds: [seedMembers[0].id, seedMembers[2].id]
  }
];

export const seedMessages: MessageSummary[] = [
  {
    id: "44444444-4444-4444-8444-444444444401",
    workspaceId: seedWorkspace.id,
    roomId: seedRooms[0].id,
    threadId: null,
    parentMessageId: null,
    authorMemberId: seedMembers[0].id,
    authorKind: "human",
    body: "Hero needs a pass before Friday. @Ari can you take it?",
    bodyFormat: "plain",
    blocks: [],
    mentions: [seedMembers[1].id],
    sourceClientId: null,
    editVersion: 1,
    createdAt: "2026-07-06T09:32:00.000Z",
    updatedAt: "2026-07-06T09:32:00.000Z",
    deletedAt: null
  },
  {
    id: "44444444-4444-4444-8444-444444444402",
    workspaceId: seedWorkspace.id,
    roomId: seedRooms[0].id,
    threadId: "55555555-5555-4555-8555-555555555501",
    parentMessageId: "44444444-4444-4444-8444-444444444401",
    authorMemberId: seedMembers[1].id,
    authorKind: "agent",
    body: "On it. I will thread the work here.",
    bodyFormat: "plain",
    blocks: [{ type: "progress", lines: ["Reviewing the launch brief", "Exploring two visual directions"] }],
    mentions: [],
    sourceClientId: null,
    editVersion: 1,
    createdAt: "2026-07-06T09:32:20.000Z",
    updatedAt: "2026-07-06T09:32:20.000Z",
    deletedAt: null
  },
  {
    id: "44444444-4444-4444-8444-444444444403",
    workspaceId: seedWorkspace.id,
    roomId: seedRooms[0].id,
    threadId: "55555555-5555-4555-8555-555555555501",
    parentMessageId: "44444444-4444-4444-8444-444444444401",
    authorMemberId: seedMembers[1].id,
    authorKind: "agent",
    body: "I have two viable directions. Which should I build out?",
    bodyFormat: "plain",
    blocks: [
      {
        type: "decision",
        kind: "pick_one",
        title: "pick one",
        status: "open",
        options: ["Bold type, no image", "Product shot and short headline"]
      }
    ],
    mentions: [],
    sourceClientId: null,
    editVersion: 1,
    createdAt: "2026-07-06T09:41:00.000Z",
    updatedAt: "2026-07-06T09:41:00.000Z",
    deletedAt: null
  },
  {
    id: "44444444-4444-4444-8444-444444444404",
    workspaceId: seedWorkspace.id,
    roomId: seedRooms[3].id,
    threadId: null,
    parentMessageId: null,
    authorMemberId: seedMembers[2].id,
    authorKind: "agent",
    body: "Migration sketch is ready to review whenever you want a deeper pass.",
    bodyFormat: "plain",
    blocks: [],
    mentions: [],
    sourceClientId: null,
    editVersion: 1,
    createdAt: "2026-07-06T10:03:00.000Z",
    updatedAt: "2026-07-06T10:03:00.000Z",
    deletedAt: null
  }
];

export const seedActivity: ActivitySummary[] = [
  {
    id: "66666666-6666-4666-8666-666666666601",
    workspaceId: seedWorkspace.id,
    roomId: seedRooms[0].id,
    threadId: "55555555-5555-4555-8555-555555555501",
    subjectKind: "decision",
    subjectId: "77777777-7777-4777-8777-777777777701",
    actorMemberId: seedMembers[1].id,
    actionOwnerMemberId: seedMembers[0].id,
    state: "action_needed",
    summary: "Ari is waiting for a hero direction",
    sortAt: "2026-07-06T09:41:00.000Z"
  },
  {
    id: "66666666-6666-4666-8666-666666666602",
    workspaceId: seedWorkspace.id,
    roomId: seedRooms[3].id,
    threadId: null,
    subjectKind: "artifact",
    subjectId: "88888888-8888-4888-8888-888888888801",
    actorMemberId: seedMembers[2].id,
    actionOwnerMemberId: null,
    state: "recently_done",
    summary: "Tau posted a migration sketch",
    sortAt: "2026-07-06T10:03:00.000Z"
  }
];
