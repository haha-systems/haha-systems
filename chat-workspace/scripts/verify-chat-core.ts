import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { createChatWorkspaceServer } from "../src/server/app.js";
import { seedMembers, seedMessages, seedRooms, seedWorkspace } from "../src/shared/seed-data.js";
import type { MessageSummary, WorkspaceEvent } from "../src/shared/types.js";

const tempDir = await mkdtemp(join(tmpdir(), "chat-workspace-core-"));
process.env.PGLITE_DATA_DIR = tempDir;
console.log("chat-core: starting server");
const runtime = await createChatWorkspaceServer({ enableVite: false });
runtime.server.listen(0, "127.0.0.1");
await once(runtime.server, "listening");
console.log("chat-core: server listening");

async function requestJson<T>(
  baseUrl: string,
  path: string,
  init: RequestInit = {}
): Promise<{ status: number; body: T }> {
  const signal = AbortSignal.timeout(5000);
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    signal,
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

function assertEvent(event: WorkspaceEvent, type: string, minSequence: number): void {
  if (event.type !== type || event.sequence < minSequence) {
    throw new Error(`Expected ${type} event after sequence ${minSequence}, got ${event.type}:${event.sequence}`);
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
  console.log("chat-core: socket ready");

  const humanMember = seedMembers[0].id;
  const ariMember = seedMembers[1].id;
  const tauDmRoom = seedRooms[3].id;
  const designRoom = seedRooms[0].id;
  const engSyncRoom = seedRooms[1].id;

  const dmSend = await requestJson<{ message: MessageSummary; idempotent: boolean }>(
    baseUrl,
    `/api/rooms/${tauDmRoom}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        workspaceId: seedWorkspace.id,
        authorMemberId: humanMember,
        body: "Can you sanity-check the migration?",
        sourceClientId: "verify:dm-1"
      })
    }
  );
  assertStatus(dmSend.status, 201, "DM send");
  console.log("chat-core: dm sent");
  const dmEvent = await events.next("DM message.created");
  assertEvent(dmEvent, "message.created", 1);

  const dmRetry = await requestJson<{ message: MessageSummary; idempotent: boolean }>(
    baseUrl,
    `/api/rooms/${tauDmRoom}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        workspaceId: seedWorkspace.id,
        authorMemberId: humanMember,
        body: "Can you sanity-check the migration?",
        sourceClientId: "verify:dm-1"
      })
    }
  );
  assertStatus(dmRetry.status, 200, "Idempotent DM retry");
  console.log("chat-core: idempotent retry returned");
  if (!dmRetry.body.idempotent || dmRetry.body.message.id !== dmSend.body.message.id) {
    throw new Error("Idempotent retry did not return the original message");
  }

  const dmHistory = await requestJson<{ messages: MessageSummary[] }>(
    baseUrl,
    `/api/rooms/${tauDmRoom}/messages?workspaceId=${seedWorkspace.id}&memberId=${humanMember}`
  );
  assertStatus(dmHistory.status, 200, "DM history");
  console.log("chat-core: dm history read");
  if (!dmHistory.body.messages.some((message) => message.id === dmSend.body.message.id)) {
    throw new Error("DM history did not include the sent message");
  }

  const channelSend = await requestJson<{ message: MessageSummary }>(baseUrl, `/api/rooms/${designRoom}/messages`, {
    method: "POST",
    body: JSON.stringify({
      workspaceId: seedWorkspace.id,
      authorMemberId: humanMember,
      body: "Shipping a channel check.",
      sourceClientId: "verify:channel-1"
    })
  });
  assertStatus(channelSend.status, 201, "Channel send");
  console.log("chat-core: channel sent");
  const channelEvent = await events.next("channel message.created");
  assertEvent(channelEvent, "message.created", dmEvent.sequence + 1);

  const reply = await requestJson<{ message: MessageSummary }>(
    baseUrl,
    `/api/messages/${seedMessages[0].id}/replies`,
    {
      method: "POST",
      body: JSON.stringify({
        authorMemberId: humanMember,
        body: "Thread reply with the final detail.",
        sourceClientId: "verify:thread-1"
      })
    }
  );
  assertStatus(reply.status, 201, "Thread reply");
  console.log("chat-core: reply sent");
  const replyEvent = await events.next("reply message.created");
  const threadEvent = await events.next("reply thread.updated");
  assertEvent(replyEvent, "message.created", channelEvent.sequence + 1);
  assertEvent(threadEvent, "thread.updated", replyEvent.sequence + 1);

  if (!reply.body.message.threadId) {
    throw new Error("Thread reply did not receive a thread id");
  }
  const threadHistory = await requestJson<{ messages: MessageSummary[] }>(
    baseUrl,
    `/api/threads/${reply.body.message.threadId}/messages?memberId=${humanMember}`
  );
  assertStatus(threadHistory.status, 200, "Thread history");
  console.log("chat-core: thread history read");
  if (!threadHistory.body.messages.some((message) => message.id === reply.body.message.id)) {
    throw new Error("Thread history did not include the reply");
  }

  const edited = await requestJson<{ message: MessageSummary }>(baseUrl, `/api/messages/${channelSend.body.message.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      editorMemberId: humanMember,
      body: "Shipping an edited channel check."
    })
  });
  assertStatus(edited.status, 200, "Message edit");
  console.log("chat-core: message edited");
  const editEvent = await events.next("message.updated");
  assertEvent(editEvent, "message.updated", threadEvent.sequence + 1);
  if (edited.body.message.editVersion !== 2) {
    throw new Error(`Expected edit version 2, got ${edited.body.message.editVersion}`);
  }

  const deleted = await requestJson<{ message: MessageSummary }>(
    baseUrl,
    `/api/messages/${channelSend.body.message.id}`,
    {
      method: "DELETE",
      body: JSON.stringify({
        deletedByMemberId: humanMember,
        reason: "verify tombstone"
      })
    }
  );
  assertStatus(deleted.status, 200, "Message delete");
  console.log("chat-core: message deleted");
  const deleteEvent = await events.next("message.deleted");
  assertEvent(deleteEvent, "message.deleted", editEvent.sequence + 1);
  if (!deleted.body.message.deletedAt || deleted.body.message.body !== "") {
    throw new Error("Deleted message did not return as a tombstone");
  }

  const dmDenied = await requestJson<{ error: string }>(
    baseUrl,
    `/api/rooms/${tauDmRoom}/messages?workspaceId=${seedWorkspace.id}&memberId=${ariMember}`
  );
  assertStatus(dmDenied.status, 403, "DM visibility enforcement");

  const channelDenied = await requestJson<{ error: string }>(baseUrl, `/api/rooms/${engSyncRoom}/messages`, {
    method: "POST",
    body: JSON.stringify({
      workspaceId: seedWorkspace.id,
      authorMemberId: ariMember,
      body: "I should not be able to post here."
    })
  });
  assertStatus(channelDenied.status, 403, "Room membership enforcement");

  socket.close();
  console.log(
    `Chat core verified: dm=${dmSend.body.message.id}, channel=${channelSend.body.message.id}, reply=${reply.body.message.id}, lastEvent=${deleteEvent.sequence}`
  );
} finally {
  await runtime.close();
  await rm(tempDir, { recursive: true, force: true });
}
