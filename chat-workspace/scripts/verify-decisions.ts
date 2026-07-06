import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { createChatWorkspaceServer } from "../src/server/app.js";
import { seedMembers, seedMessages, seedWorkspace } from "../src/shared/seed-data.js";
import type { DecisionBlockSummary, MessageSummary, WakeEventSummary, WorkspaceEvent } from "../src/shared/types.js";

const tempDir = await mkdtemp(join(tmpdir(), "chat-workspace-decisions-"));
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

function createEventReader(socket: WebSocket): { next(label: string): Promise<WorkspaceEvent> } {
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
    next(label: string): Promise<WorkspaceEvent> {
      const queued = queue.shift();
      if (queued) {
        return Promise.resolve(queued);
      }
      return Promise.race([
        new Promise<WorkspaceEvent>((resolve) => waiters.push(resolve)),
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

try {
  const address = runtime.server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected TCP server address");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  const socket = new WebSocket(
    `ws://127.0.0.1:${address.port}/api/workspaces/${seedWorkspace.id}/events/ws?token=dev-workspace-token`
  );
  const events = createEventReader(socket);
  await events.next("connection.ready");

  const humanMemberId = seedMembers[0].id;
  const ariMemberId = seedMembers[1].id;
  const messageId = seedMessages[1].id;

  const approveCreate = await requestJson<{ decisionBlock: DecisionBlockSummary; message: MessageSummary }>(
    baseUrl,
    `/api/messages/${messageId}/decision-blocks`,
    {
      method: "POST",
      body: JSON.stringify({
        createdByAgentMemberId: ariMemberId,
        kind: "approve_reject",
        title: "Approve launch polish",
        prompt: "Should Ari continue with the polished launch direction?",
        idempotencyKey: "verify:decision:approve",
        schema: { approveLabel: "Approve", rejectLabel: "Reject" }
      })
    }
  );
  assertStatus(approveCreate.status, 201, "Approve decision create");
  assertEvent(await events.next("approve decision.created"), "decision.created");
  assertEvent(await events.next("approve message.updated"), "message.updated");

  const openList = await requestJson<{ decisionBlocks: DecisionBlockSummary[] }>(
    baseUrl,
    `/api/workspaces/${seedWorkspace.id}/decision-blocks?memberId=${humanMemberId}&status=open`
  );
  assertStatus(openList.status, 200, "Decision list");
  if (!openList.body.decisionBlocks.some((block) => block.id === approveCreate.body.decisionBlock.id)) {
    throw new Error("Open decision list did not include created approve/reject block");
  }

  const approveResolve = await requestJson<{
    decisionBlock: DecisionBlockSummary;
    message: MessageSummary;
    wakeEvent: WakeEventSummary;
  }>(baseUrl, `/api/decision-blocks/${approveCreate.body.decisionBlock.id}/resolve`, {
    method: "POST",
    body: JSON.stringify({
      resolvedByMemberId: humanMemberId,
      expectedUpdatedAt: approveCreate.body.decisionBlock.updatedAt,
      result: { decision: "approved" }
    })
  });
  assertStatus(approveResolve.status, 200, "Approve decision resolve");
  if (approveResolve.body.decisionBlock.status !== "resolved") {
    throw new Error("Approve/reject decision was not resolved");
  }
  if (
    approveResolve.body.wakeEvent.status !== "queued" ||
    approveResolve.body.wakeEvent.targetAgentMemberId !== ariMemberId
  ) {
    throw new Error("Resolve did not queue a wake for the creating agent");
  }
  assertEvent(await events.next("approve decision.resolved"), "decision.resolved");
  assertEvent(await events.next("approve message.updated after resolve"), "message.updated");
  assertEvent(await events.next("approve wake.queued"), "wake.queued");

  const staleResolve = await requestJson<{ error: string }>(
    baseUrl,
    `/api/decision-blocks/${approveCreate.body.decisionBlock.id}/resolve`,
    {
      method: "POST",
      body: JSON.stringify({
        resolvedByMemberId: humanMemberId,
        expectedUpdatedAt: approveCreate.body.decisionBlock.updatedAt,
        result: { decision: "rejected" }
      })
    }
  );
  assertStatus(staleResolve.status, 409, "Stale decision resolve");

  const shortCreate = await requestJson<{ decisionBlock: DecisionBlockSummary }>(
    baseUrl,
    `/api/messages/${messageId}/decision-blocks`,
    {
      method: "POST",
      body: JSON.stringify({
        createdByAgentMemberId: ariMemberId,
        kind: "short_question",
        title: "Launch note",
        prompt: "What copy should Ari use for the launch note?",
        idempotencyKey: "verify:decision:short",
        schema: { placeholder: "Short copy", maxLength: 120 }
      })
    }
  );
  assertStatus(shortCreate.status, 201, "Short-question create");
  await events.next("short decision.created");
  await events.next("short message.updated");

  const shortResolve = await requestJson<{ decisionBlock: DecisionBlockSummary; wakeEvent: WakeEventSummary }>(
    baseUrl,
    `/api/decision-blocks/${shortCreate.body.decisionBlock.id}/resolve`,
    {
      method: "POST",
      body: JSON.stringify({
        resolvedByMemberId: humanMemberId,
        expectedUpdatedAt: shortCreate.body.decisionBlock.updatedAt,
        result: { answer: "Use the short headline from the product-shot direction." }
      })
    }
  );
  assertStatus(shortResolve.status, 200, "Short-question resolve");
  if (shortResolve.body.decisionBlock.result?.answer !== "Use the short headline from the product-shot direction.") {
    throw new Error("Short-question receipt did not persist the answer");
  }

  const receiptCounts = await runtime.client.query<{ resolved_events: string; wake_events: string; outbox_events: string }>(
    `
    SELECT
      (SELECT count(*)::text FROM decision_block_events WHERE event_type = 'resolved') AS resolved_events,
      (SELECT count(*)::text FROM wake_events WHERE trigger_kind = 'decision_resolved' AND status = 'queued') AS wake_events,
      (SELECT count(*)::text FROM outbox_events WHERE event_type IN ('decision.resolved', 'wake.queued')) AS outbox_events
    `
  );
  const counts = receiptCounts.rows[0];
  if (Number(counts.resolved_events) < 2 || Number(counts.wake_events) < 2 || Number(counts.outbox_events) < 4) {
    throw new Error(`Decision receipt/wake/outbox counts were too low: ${JSON.stringify(counts)}`);
  }

  const resolvedList = await requestJson<{ decisionBlocks: DecisionBlockSummary[] }>(
    baseUrl,
    `/api/workspaces/${seedWorkspace.id}/decision-blocks?memberId=${humanMemberId}&status=resolved`
  );
  assertStatus(resolvedList.status, 200, "Resolved decision list");
  if (!resolvedList.body.decisionBlocks.some((block) => block.id === shortCreate.body.decisionBlock.id)) {
    throw new Error("Resolved decision list did not include short-question block");
  }

  socket.close();
  console.log("Decision verification passed: create/list/resolve/stale/wake/outbox");
} finally {
  await runtime.close();
  await rm(tempDir, { recursive: true, force: true });
}
