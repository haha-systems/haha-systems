import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyMigrations } from "../src/db/migrate.js";
import { createSqlClient } from "../src/db/runtime.js";
import { loadBootstrap } from "../src/server/repository.js";
import { seedMembers, seedMessages, seedRooms, seedWorkspace } from "../src/shared/seed-data.js";
import type { ActivitySummary, BootstrapPayload, ThreadStatus } from "../src/shared/types.js";

const tempDir = await mkdtemp(join(tmpdir(), "chat-workspace-live-state-"));
process.env.PGLITE_DATA_DIR = tempDir;
const client = await createSqlClient();

const humanMember = seedMembers[0].id;
const ariMember = seedMembers[1].id;
const tauMember = seedMembers[2].id;
const designRoom = seedRooms[0].id;
const heroThread = "55555555-5555-4555-8555-555555555501";
const heroDecision = "77777777-7777-4777-8777-777777777701";
const sessionId = "99999999-9999-4999-8999-999999999991";

function findActivity(
  bootstrap: BootstrapPayload,
  subjectKind: ActivitySummary["subjectKind"],
  subjectId: string,
  state: ActivitySummary["state"]
): ActivitySummary | undefined {
  return bootstrap.activity.find(
    (item) => item.subjectKind === subjectKind && item.subjectId === subjectId && item.state === state
  );
}

function assertThreadStatus(bootstrap: BootstrapPayload, expected: ThreadStatus, label: string): void {
  const thread = bootstrap.threadStates.find((candidate) => candidate.id === heroThread);
  if (thread?.status !== expected) {
    throw new Error(`${label}: expected hero thread ${expected}, got ${thread?.status ?? "missing"}`);
  }
}

function assertPresence(bootstrap: BootstrapPayload, memberId: string, expected: string, label: string): void {
  const member = bootstrap.members.find((candidate) => candidate.id === memberId);
  if (member?.presenceState !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${member?.presenceState ?? "missing"}`);
  }
}

try {
  await applyMigrations(client);
  await client.query("DELETE FROM activity_items WHERE workspace_id = $1", [seedWorkspace.id]);
  await client.query(
    `
    INSERT INTO activity_items(id, workspace_id, room_id, thread_id, subject_kind, subject_id, actor_member_id, state, sort_at, summary)
    VALUES ($1, $2, $3, $4, 'thread', $4, $5, 'action_needed', now(), 'stale static row')
    `,
    [
      "66666666-6666-4666-8666-666666666699",
      seedWorkspace.id,
      designRoom,
      heroThread,
      ariMember
    ]
  );

  let bootstrap = await loadBootstrap(client, seedWorkspace.id, humanMember);
  const actionNeeded = bootstrap.activity.filter((item) => item.state === "action_needed");
  if (actionNeeded.length !== 1 || actionNeeded[0].subjectId !== heroDecision) {
    throw new Error(`Expected exactly one live decision action, got ${JSON.stringify(actionNeeded)}`);
  }
  if (actionNeeded[0].actionOwnerMemberId !== humanMember) {
    throw new Error("Open decision was not assigned to the current viewer");
  }
  if (bootstrap.activity.some((item) => item.summary === "stale static row")) {
    throw new Error("Bootstrap still surfaced static activity_items rows");
  }
  if (!findActivity(bootstrap, "artifact", "88888888-8888-4888-8888-888888888801", "recently_done")) {
    throw new Error("Artifact activity was not derived");
  }
  assertThreadStatus(bootstrap, "waiting", "open decision");
  assertPresence(bootstrap, ariMember, "waiting", "open decision");

  await client.query(
    `
    UPDATE decision_blocks
    SET status = 'resolved',
      resolved_by_member_id = $2,
      resolved_at = '2026-07-06T10:11:00.000Z',
      updated_at = '2026-07-06T10:11:00.000Z'
    WHERE id = $1
    `,
    [heroDecision, humanMember]
  );
  bootstrap = await loadBootstrap(client, seedWorkspace.id, humanMember);
  if (bootstrap.activity.some((item) => item.state === "action_needed")) {
    throw new Error("Resolved decision still counted as action needed");
  }
  if (!findActivity(bootstrap, "decision", heroDecision, "recently_done")) {
    throw new Error("Resolved decision did not move to recently done");
  }
  assertThreadStatus(bootstrap, "done", "resolved decision");

  await client.query(
    `
    INSERT INTO agent_sessions(
      id,
      workspace_id,
      agent_member_id,
      room_id,
      thread_id,
      state,
      adapter_type,
      model,
      started_at,
      last_output_at
    )
    VALUES ($1, $2, $3, $4, $5, 'running', 'local-adapter', 'gpt-5-codex', now(), now())
    `,
    [sessionId, seedWorkspace.id, tauMember, designRoom, heroThread]
  );
  bootstrap = await loadBootstrap(client, seedWorkspace.id, humanMember);
  assertThreadStatus(bootstrap, "working", "running session");
  assertPresence(bootstrap, tauMember, "working", "running session");

  await client.query(
    `
    UPDATE agent_sessions
    SET state = 'completed',
      finished_at = '2026-07-06T10:16:00.000Z',
      updated_at = '2026-07-06T10:16:00.000Z'
    WHERE id = $1
    `,
    [sessionId]
  );
  bootstrap = await loadBootstrap(client, seedWorkspace.id, humanMember);
  if (!findActivity(bootstrap, "session", sessionId, "recently_done")) {
    throw new Error("Completed session did not appear in recently done");
  }
  assertThreadStatus(bootstrap, "done", "completed session");
  assertPresence(bootstrap, tauMember, "idle", "completed session");

  console.log(
    `Live state verified: actions=${actionNeeded.length}, activity=${bootstrap.activity.length}, threads=${bootstrap.threadStates.length}`
  );
} finally {
  await client.close();
  await rm(tempDir, { recursive: true, force: true });
}
