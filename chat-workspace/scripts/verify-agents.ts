import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { createChatWorkspaceServer } from "../src/server/app.js";
import { seedMembers, seedWorkspace } from "../src/shared/seed-data.js";
import type { AgentSummary, BootstrapPayload, DecisionBlockSummary, MessageSummary, WorkspaceEvent } from "../src/shared/types.js";

const tempDir = await mkdtemp(join(tmpdir(), "chat-workspace-agents-"));
process.env.PGLITE_DATA_DIR = tempDir;
const runtime = await createChatWorkspaceServer({ enableVite: false });
runtime.server.listen(0, "127.0.0.1");
await once(runtime.server, "listening");

type JsonResponse<T> = { status: number; body: T };

async function requestJson<T>(baseUrl: string, path: string, init: RequestInit = {}): Promise<JsonResponse<T>> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(5000),
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });
  const body = (await response.json()) as T;
  return { status: response.status, body };
}

type TimedEvent = { event: WorkspaceEvent; source: "queue" | "timeout" };

function createEventReader(socket: WebSocket): { next(label: string): Promise<TimedEvent> } {
  const queue: WorkspaceEvent[] = [];
  const waiters: Array<(event: WorkspaceEvent) => void> = [];

  socket.on("message", (raw: Buffer) => {
    const event = JSON.parse(raw.toString()) as WorkspaceEvent;
    const waiter = waiters.shift();
    if (waiter) {
      waiter(event);
      return;
    }
    queue.push(event);
  });

  return {
    next(label: string): Promise<TimedEvent> {
      console.log(`[agent-verify] waiting for ${label}`);
      const queued = queue.shift();
      if (queued) {
        console.log(`[agent-verify] got ${label}: ${queued.type}`);
        return Promise.resolve({ event: queued, source: "queue" });
      }
      return Promise.race([
        new Promise<TimedEvent>((resolve) => waiters.push((event) => resolve({ event, source: "queue" }))),
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), 5000);
        })
      ]);
    }
  };
}

function assertStatus(status: number, expected: number, label: string): void {
  if (status !== expected) {
    throw new Error(`${label} returned ${status}, expected ${expected}`);
  }
}

function assertEvent(event: WorkspaceEvent, type: string): void {
  if (event.type !== type) {
    throw new Error(`Expected ${type} event, got ${event.type}`);
  }
}

async function nextEvent(reader: ReturnType<typeof createEventReader>, label: string): Promise<WorkspaceEvent> {
  const timed = await reader.next(label);
  if (timed.source === "timeout") {
    throw new Error(`Timed out waiting for ${label}`);
  }
  return timed.event;
}

try {
  const address = runtime.server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected TCP server address");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  const humanMemberId = seedMembers[0].id;
  const socket = new WebSocket(
    `ws://127.0.0.1:${address.port}/api/workspaces/${seedWorkspace.id}/events/ws?token=dev-workspace-token`
  );
  const events = createEventReader(socket);
  await nextEvent(events, "connection.ready");

  const created = await requestJson<{ agent: AgentSummary }>(baseUrl, `/api/workspaces/${seedWorkspace.id}/agents`, {
    method: "POST",
    body: JSON.stringify({
      createdByMemberId: humanMemberId,
      displayName: "Nova",
      handle: "nova",
      role: "Researcher",
      adapterType: "local-adapter",
      model: "gpt-5-codex",
      instructionsRef: "agents/nova.md",
      capabilities: { chat: true, research: true },
      budgetPolicy: { hourlyTokens: 12000 }
    })
  });
  assertStatus(created.status, 201, "Agent create");
  assertEvent(await nextEvent(events, "agent.created"), "agent.created");

  const agent = created.body.agent;
  if (!agent.dmRoomId || !agent.profile.isEnabled || agent.member.handle !== "nova") {
    throw new Error("Created agent did not include enabled profile and DM room");
  }

  const duplicate = await requestJson<{ error: string }>(baseUrl, `/api/workspaces/${seedWorkspace.id}/agents`, {
    method: "POST",
    body: JSON.stringify({
      createdByMemberId: humanMemberId,
      displayName: "Nova Two",
      handle: "nova"
    })
  });
  assertStatus(duplicate.status, 409, "Duplicate handle");

  const bootstrap = await requestJson<BootstrapPayload>(baseUrl, `/api/bootstrap?memberId=${humanMemberId}`);
  assertStatus(bootstrap.status, 200, "Bootstrap after create");
  if (!bootstrap.body.members.some((member) => member.id === agent.member.id && member.isEnabled)) {
    throw new Error("Bootstrap did not include the created enabled agent");
  }
  if (!bootstrap.body.rooms.some((room) => room.id === agent.dmRoomId && room.memberIds.includes(humanMemberId))) {
    throw new Error("Bootstrap did not expose the provisioned human-agent DM");
  }
  const mentionRoom = bootstrap.body.rooms.find((room) => room.name === "design-review");
  if (!mentionRoom) {
    throw new Error("Expected design-review room in bootstrap payload");
  }

  const agents = await requestJson<{ agents: AgentSummary[] }>(
    baseUrl,
    `/api/workspaces/${seedWorkspace.id}/agents?memberId=${humanMemberId}`
  );
  assertStatus(agents.status, 200, "Agent list");
  if (!agents.body.agents.some((candidate) => candidate.member.id === agent.member.id && candidate.dmRoomId === agent.dmRoomId)) {
    throw new Error("Agent list did not include the created agent and DM room");
  }

  const updated = await requestJson<{ agent: AgentSummary }>(
    baseUrl,
    `/api/workspaces/${seedWorkspace.id}/agents/${agent.member.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        updatedByMemberId: humanMemberId,
        displayName: "Nova Prime",
        handle: "nova-prime",
        model: "gpt-5.1-codex",
        capabilities: { chat: true, research: true, artifacts: true }
      })
    }
  );
  assertStatus(updated.status, 200, "Agent update");
  assertEvent(await nextEvent(events, "agent.updated"), "agent.updated");
  if (updated.body.agent.member.handle !== "nova-prime" || updated.body.agent.profile.model !== "gpt-5.1-codex") {
    throw new Error("Agent update did not persist identity/profile changes");
  }

  const initialDmMessage = await requestJson<{ message: MessageSummary }>(
    baseUrl,
    `/api/rooms/${agent.dmRoomId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        workspaceId: seedWorkspace.id,
        authorMemberId: humanMemberId,
        body: "Can you ask me one thing?",
        sourceClientId: "verify:agent-dm-question"
      })
    }
  );
  assertStatus(initialDmMessage.status, 201, "DM route check message");
  await nextEvent(events, "dm message.created");
  await nextEvent(events, "dm wake.queued");
  const dmProgressEvent = await nextEvent(events, "dm progress message.created");
  assertEvent(dmProgressEvent, "message.created");
  const dmProgressMessage = dmProgressEvent.payload.message as MessageSummary | undefined;
  if (!dmProgressMessage || dmProgressMessage.authorKind !== "agent") {
    throw new Error("DM route did not produce an agent-authored progress message");
  }

  const dmWakeState = await runtime.client.query<{ status: string; room_id: string }>(
    `
    SELECT status::text AS status, room_id
    FROM wake_events
    WHERE workspace_id = $1 AND trigger_message_id = $2 AND trigger_kind = 'dm_message'
    `,
    [seedWorkspace.id, initialDmMessage.body.message.id]
  );
  console.log("[agent-verify] dm wake rows", dmWakeState.rows);
  if (dmWakeState.rows.length !== 1 || dmWakeState.rows[0].status !== "queued") {
    throw new Error(`DM route did not create queued wake event: ${JSON.stringify(dmWakeState.rows)}`);
  }
  const dmSession = await runtime.client.query<{ state: string }>(
    `
    SELECT state::text AS state
      FROM agent_sessions
      WHERE workspace_id = $1
      AND session_ref = (
        SELECT id::text
        FROM wake_events
        WHERE workspace_id = $1
          AND trigger_message_id = $2
          AND trigger_kind = 'dm_message'
      )
  `,
    [seedWorkspace.id, initialDmMessage.body.message.id]
  );
  console.log("[agent-verify] dm session rows", dmSession.rows);
  if (dmSession.rows.length !== 1 || dmSession.rows[0].state !== "queued") {
    throw new Error(`DM route did not create queued agent session: ${JSON.stringify(dmSession.rows)}`);
  }
  console.log("[agent-verify] DM route and session validated");

  const mentionTarget = await requestJson<{ agent: AgentSummary }>(
    baseUrl,
    `/api/workspaces/${seedWorkspace.id}/agents`,
    {
      method: "POST",
      body: JSON.stringify({
        createdByMemberId: humanMemberId,
        displayName: "Orion",
        handle: "orion",
        role: "Coordinator",
        adapterType: "local-adapter",
        model: "gpt-5-codex",
        instructionsRef: "agents/orion.md",
        capabilities: { chat: true, routing: true }
      })
    }
  );
  assertStatus(mentionTarget.status, 201, "Mention target agent create");
  assertEvent(await nextEvent(events, "mention target agent.created"), "agent.created");
  console.log("[agent-verify] Mention target created");

  const mentionDisabled = await requestJson<{ agent: AgentSummary }>(
    baseUrl,
    `/api/workspaces/${seedWorkspace.id}/agents`,
    {
      method: "POST",
      body: JSON.stringify({
        createdByMemberId: humanMemberId,
        displayName: "Disabled",
        handle: "disabled-bot",
        role: "Coordinator",
        adapterType: "local-adapter",
        model: "gpt-5-codex",
        instructionsRef: "agents/disabled.md"
      })
    }
  );
  assertStatus(mentionDisabled.status, 201, "Disabled mention target create");
  assertEvent(await nextEvent(events, "mention target disabled agent.created"), "agent.created");
  console.log("[agent-verify] Disabled mention target created");
  const disableMentionTarget = await requestJson<{ agent: AgentSummary }>(
    baseUrl,
    `/api/workspaces/${seedWorkspace.id}/agents/${mentionDisabled.body.agent.member.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ updatedByMemberId: humanMemberId, isEnabled: false })
    }
  );
  assertStatus(disableMentionTarget.status, 200, "Disabled mention target disable");
  assertEvent(await nextEvent(events, "mention target disabled agent.disabled"), "agent.disabled");

  console.log("[agent-verify] sending mention route message");
  const mentionMessage = await requestJson<{ message: MessageSummary }>(
    baseUrl,
    `/api/rooms/${mentionRoom.id}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        workspaceId: seedWorkspace.id,
        authorMemberId: humanMemberId,
        body: "Route only the enabled agents in this mention set.",
        mentions: [mentionTarget.body.agent.member.id, mentionDisabled.body.agent.member.id],
        sourceClientId: "verify:mention-route"
      })
    }
  );
  assertStatus(mentionMessage.status, 201, "Mention route check message");
  console.log("[agent-verify] mention message sent:", mentionMessage.body.message.id);
  const preWakes = await runtime.client.query<{ target_agent_member_id: string }>(
    `
    SELECT target_agent_member_id
    FROM wake_events
    WHERE workspace_id = $1 AND trigger_message_id = $2
    `,
    [seedWorkspace.id, mentionMessage.body.message.id]
  );
  console.log("[agent-verify] pre-fetched mention wake rows:", preWakes.rows);
  await nextEvent(events, "mention message created");
  const mentionRoutingEvents: WorkspaceEvent[] = [
    await nextEvent(events, "mention route event 1"),
    await nextEvent(events, "mention route event 2")
  ];
  const mentionWakeTargets = mentionRoutingEvents
    .filter((event) => event.type === "wake.queued")
    .map((event) => (event.payload.wakeEvent as { targetAgentMemberId: string }).targetAgentMemberId);
  if (mentionWakeTargets.includes(mentionDisabled.body.agent.member.id)) {
    throw new Error("Disabled mention target was queued for wake");
  }
  const expectedMentionTargets = [mentionTarget.body.agent.member.id].sort();
  const actualMentionTargets = mentionWakeTargets.sort();
  if (
    mentionWakeTargets.length !== 1 ||
    actualMentionTargets[0] !== expectedMentionTargets[0]
  ) {
    throw new Error(`Unexpected mention wake targets: ${JSON.stringify(mentionWakeTargets)}`);
  }
  const mentionProgressMessages = mentionRoutingEvents
    .filter((event) => event.type === "message.created")
    .map((event) => event.payload.message as MessageSummary | undefined)
    .filter((message): message is MessageSummary => Boolean(message));
  if (
    mentionProgressMessages.length !== 1 ||
    mentionProgressMessages[0].authorKind !== "agent"
  ) {
    throw new Error("Mention routing did not create a single enabled-agent progress message");
  }
  const mentionWakes = await runtime.client.query<{ target_agent_member_id: string }>(
    `
    SELECT target_agent_member_id
    FROM wake_events
    WHERE workspace_id = $1 AND trigger_message_id = $2
    `,
    [seedWorkspace.id, mentionMessage.body.message.id]
  );
  if (
    mentionWakes.rows.length !== 1 ||
    mentionWakes.rows[0].target_agent_member_id !== mentionTarget.body.agent.member.id
  ) {
    throw new Error(`Unexpected mention wake rows: ${JSON.stringify(mentionWakes.rows)}`);
  }

  await runtime.client.query(
    `
    INSERT INTO wake_events(
      id, workspace_id, target_agent_member_id, trigger_kind, routing_policy_version, dedupe_key, status
    )
    VALUES ('aaaaaaaa-1234-4aaa-8aaa-aaaaaaaaaaaa', $1, $2, 'mention', 'verify', 'verify:disable:wake', 'queued')
    `,
    [seedWorkspace.id, agent.member.id]
  );
  await runtime.client.query(
    `
    INSERT INTO agent_sessions(id, workspace_id, agent_member_id, state, adapter_type, model)
    VALUES ('bbbbbbbb-1234-4bbb-8bbb-bbbbbbbbbbbb', $1, $2, 'running', 'local-adapter', 'gpt-5-codex')
    `,
    [seedWorkspace.id, agent.member.id]
  );

  const disabled = await requestJson<{ agent: AgentSummary }>(
    baseUrl,
    `/api/workspaces/${seedWorkspace.id}/agents/${agent.member.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ updatedByMemberId: humanMemberId, isEnabled: false })
    }
  );
  assertStatus(disabled.status, 200, "Agent disable");
  assertEvent(await nextEvent(events, "agent.disabled"), "agent.disabled");
  if (disabled.body.agent.profile.isEnabled || disabled.body.agent.member.presenceState !== "offline") {
    throw new Error("Disabled agent did not project as offline");
  }

  const cancelled = await runtime.client.query<{ wake_status: string; session_state: string }>(
    `
    SELECT
      (SELECT status::text FROM wake_events WHERE dedupe_key = 'verify:disable:wake') AS wake_status,
      (SELECT state::text FROM agent_sessions WHERE id = 'bbbbbbbb-1234-4bbb-8bbb-bbbbbbbbbbbb') AS session_state
    `
  );
  if (cancelled.rows[0].wake_status !== "cancelled" || cancelled.rows[0].session_state !== "cancelled") {
    throw new Error(`Disable did not cancel active work: ${JSON.stringify(cancelled.rows[0])}`);
  }

  const disabledDmAttempt = await requestJson<{ message: MessageSummary }>(
    baseUrl,
    `/api/rooms/${agent.dmRoomId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        workspaceId: seedWorkspace.id,
        authorMemberId: humanMemberId,
        body: "Can you ask me one thing?",
        sourceClientId: "verify:disabled-agent-dm"
      })
    }
  );
  if (disabledDmAttempt.status !== 403) {
    throw new Error(`Disabled DM message returned ${disabledDmAttempt.status}, expected 403`);
  }
  const disabledDmHistory = await requestJson<{ messages: MessageSummary[] }>(
    baseUrl,
    `/api/rooms/${agent.dmRoomId}/messages?workspaceId=${seedWorkspace.id}`
  );
  assertStatus(disabledDmHistory.status, 200, "Disabled agent DM room list");
  if (!disabledDmHistory.body.messages.some((message) => message.id === initialDmMessage.body.message.id)) {
    throw new Error("Disabled DM room history was not preserved");
  }

  const disabledDecision = await requestJson<{ decisionBlock: DecisionBlockSummary }>(
    baseUrl,
    `/api/messages/${initialDmMessage.body.message.id}/decision-blocks`,
    {
      method: "POST",
      body: JSON.stringify({
        createdByAgentMemberId: agent.member.id,
        kind: "short_question",
        title: "Disabled wake check",
        prompt: "What should Nova do next?",
        idempotencyKey: "verify:disabled-agent-decision"
      })
    }
  );
  assertStatus(disabledDecision.status, 201, "Disabled agent decision create");
  await nextEvent(events, "disabled decision.created");
  await nextEvent(events, "disabled decision message.updated");

  const disabledResolve = await requestJson<{ decisionBlock: DecisionBlockSummary; wakeEvent?: unknown }>(
    baseUrl,
    `/api/decision-blocks/${disabledDecision.body.decisionBlock.id}/resolve`,
    {
      method: "POST",
      body: JSON.stringify({
        resolvedByMemberId: humanMemberId,
        expectedUpdatedAt: disabledDecision.body.decisionBlock.updatedAt,
        result: { answer: "Stay disabled for now." }
      })
    }
  );
  assertStatus(disabledResolve.status, 200, "Disabled decision resolve");
  await nextEvent(events, "disabled decision.resolved");
  await nextEvent(events, "disabled decision message.updated after resolve");
  if (disabledResolve.body.wakeEvent) {
    throw new Error("Resolving a disabled agent decision unexpectedly queued a wake");
  }

  const reactivated = await requestJson<{ agent: AgentSummary }>(
    baseUrl,
    `/api/workspaces/${seedWorkspace.id}/agents/${agent.member.id}/reactivate`,
    {
      method: "POST",
      body: JSON.stringify({ updatedByMemberId: humanMemberId })
    }
  );
  assertStatus(reactivated.status, 200, "Agent reactivate");
  assertEvent(await nextEvent(events, "agent.enabled"), "agent.enabled");
  if (!reactivated.body.agent.profile.isEnabled) {
    throw new Error("Reactivated agent remained disabled");
  }

  const removed = await requestJson<{ agent: AgentSummary; historyPreserved: boolean }>(
    baseUrl,
    `/api/workspaces/${seedWorkspace.id}/agents/${agent.member.id}?memberId=${humanMemberId}`,
    { method: "DELETE" }
  );
  assertStatus(removed.status, 200, "Agent remove");
  await nextEvent(events, "agent.disabled during remove");
  assertEvent(await nextEvent(events, "agent.removed"), "agent.removed");
  if (!removed.body.historyPreserved || removed.body.agent.profile.isEnabled) {
    throw new Error("Remove did not preserve history while disabling the agent");
  }

  socket.close();
  console.log(`Agent CRUD verified: agent=${agent.member.id}, dm=${agent.dmRoomId}`);
} finally {
  await runtime.close();
  await rm(tempDir, { recursive: true, force: true });
}
