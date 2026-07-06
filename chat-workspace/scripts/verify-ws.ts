import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { createChatWorkspaceServer } from "../src/server/app.js";
import { seedWorkspace } from "../src/shared/seed-data.js";
import type { WorkspaceEvent } from "../src/shared/types.js";

const tempDir = await mkdtemp(join(tmpdir(), "chat-workspace-ws-"));
process.env.PGLITE_DATA_DIR = tempDir;
const runtime = await createChatWorkspaceServer({ enableVite: false });
runtime.server.listen(0, "127.0.0.1");
await once(runtime.server, "listening");

try {
  const address = runtime.server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected TCP server address");
  }

  const socket = new WebSocket(
    `ws://127.0.0.1:${address.port}/api/workspaces/${seedWorkspace.id}/events/ws?token=dev-workspace-token`
  );

  const [raw] = (await once(socket, "message")) as [Buffer];
  const event = JSON.parse(raw.toString()) as WorkspaceEvent;

  if (event.workspaceId !== seedWorkspace.id || event.type !== "connection.ready" || event.sequence < 1) {
    throw new Error(`Unexpected workspace event: ${raw.toString()}`);
  }

  console.log(`WebSocket verified: ${event.type} sequence=${event.sequence}`);
  socket.close();
} finally {
  await runtime.close();
  await rm(tempDir, { recursive: true, force: true });
}
