import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { createChatWorkspaceServer } from "../src/server/app.js";
import { seedMembers, seedMessages, seedWorkspace } from "../src/shared/seed-data.js";
import type { ArtifactKind, ArtifactSummary, WorkspaceEvent } from "../src/shared/types.js";

const tempDir = await mkdtemp(join(tmpdir(), "chat-workspace-artifacts-"));
process.env.PGLITE_DATA_DIR = tempDir;
console.log("artifacts: starting server");
const runtime = await createChatWorkspaceServer({ enableVite: false });
runtime.server.listen(0, "127.0.0.1");
await once(runtime.server, "listening");
console.log("artifacts: server listening");

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
      const queuedIndex = queue.findIndex((event) => event.type !== "connection.ready");
      if (queuedIndex >= 0) {
        const [queued] = queue.splice(queuedIndex, 1);
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

function assertArtifactShape(artifact: ArtifactSummary, kind: ArtifactKind): void {
  if (artifact.kind !== kind) {
    throw new Error(`Expected ${kind}, got ${artifact.kind}`);
  }
  if ("rawHtml" in artifact.preview || "script" in artifact.preview) {
    throw new Error(`${kind} preview retained unsafe preview keys`);
  }
  if ("unsafe" in artifact.provenance) {
    throw new Error(`${kind} provenance retained object metadata`);
  }
  if (kind === "link" && artifact.preview.url?.startsWith("javascript:")) {
    throw new Error("Link preview retained a javascript URL");
  }
  if (kind === "image" && artifact.preview.imageUrl?.startsWith("javascript:")) {
    throw new Error("Image preview retained a javascript URL");
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
  console.log("artifacts: socket ready");

  const cases: Array<{
    kind: ArtifactKind;
    title: string;
    mimeType?: string;
    storageKey?: string;
    externalUrl?: string;
    preview: Record<string, unknown>;
  }> = [
    {
      kind: "markdown",
      title: "unsafe-notes.md",
      mimeType: "text/markdown",
      preview: {
        markdown: "# Title <script>alert(1)</script>",
        rawHtml: "<img src=x onerror=alert(1)>"
      }
    },
    {
      kind: "link",
      title: "release brief",
      externalUrl: "https://example.com/brief?x=1",
      preview: {
        url: "javascript:alert(1)",
        description: "External release brief",
        rawHtml: "<script>alert(1)</script>"
      }
    },
    {
      kind: "file",
      title: "handoff.zip",
      mimeType: "application/zip",
      storageKey: "workspace/handoff.zip",
      preview: {
        fileName: "handoff.zip",
        sizeBytes: 2048,
        rawHtml: "<script>alert(1)</script>"
      }
    },
    {
      kind: "image",
      title: "hero.png",
      mimeType: "image/png",
      externalUrl: "https://example.com/hero.png",
      preview: {
        imageUrl: "javascript:alert(1)",
        altText: "Hero image",
        width: 640,
        height: 360,
        rawHtml: "<script>alert(1)</script>"
      }
    }
  ];

  const created: ArtifactSummary[] = [];
  for (const artifactCase of cases) {
    const response = await requestJson<{ artifact: ArtifactSummary }>(baseUrl, "/api/artifacts", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: seedWorkspace.id,
        messageId: seedMessages[0].id,
        createdByMemberId: seedMembers[1].id,
        ...artifactCase,
        provenance: {
          source: "verify-artifacts",
          unsafe: { nested: true }
        }
      })
    });
    assertStatus(response.status, 201, `${artifactCase.kind} create`);
    assertArtifactShape(response.body.artifact, artifactCase.kind);
    created.push(response.body.artifact);

    const event = await events.next(`${artifactCase.kind} artifact.created`);
    if (event.type !== "artifact.created") {
      throw new Error(`Expected artifact.created event, got ${event.type}`);
    }
  }

  const read = await requestJson<{ artifact: ArtifactSummary }>(baseUrl, `/api/artifacts/${created[0].id}?memberId=${seedMembers[0].id}`);
  assertStatus(read.status, 200, "Artifact read");
  assertArtifactShape(read.body.artifact, "markdown");

  const list = await requestJson<{ artifacts: ArtifactSummary[] }>(
    baseUrl,
    `/api/workspaces/${seedWorkspace.id}/artifacts?messageId=${seedMessages[0].id}&memberId=${seedMembers[0].id}`
  );
  assertStatus(list.status, 200, "Artifact list");
  for (const artifactCase of cases) {
    if (!list.body.artifacts.some((artifact) => artifact.kind === artifactCase.kind)) {
      throw new Error(`List did not include ${artifactCase.kind} artifact`);
    }
  }

  const hidden = await requestJson<{ error: string }>(
    baseUrl,
    `/api/artifacts/${created[0].id}?memberId=22222222-2222-4222-8222-222222222202`
  );
  assertStatus(hidden.status, 200, "Channel artifact visibility for member");

  socket.close();
  console.log(`Artifacts verified: created=${created.length}, first=${created[0].id}`);
} finally {
  await runtime.close();
  await rm(tempDir, { recursive: true, force: true });
}
