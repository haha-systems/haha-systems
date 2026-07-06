import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createChatWorkspaceServer } from "../src/server/app.js";
import { seedWorkspace } from "../src/shared/seed-data.js";
import type { BootstrapPayload } from "../src/shared/types.js";

const tempDir = await mkdtemp(join(tmpdir(), "chat-workspace-boot-"));
process.env.PGLITE_DATA_DIR = tempDir;
const runtime = await createChatWorkspaceServer({ enableVite: false });
runtime.server.listen(0, "127.0.0.1");
await once(runtime.server, "listening");

try {
  const address = runtime.server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected TCP server address");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  const health = await fetch(`${baseUrl}/api/health`).then((response) => response.json() as Promise<{ status: string }>);
  const bootstrap = await fetch(`${baseUrl}/api/bootstrap`).then(
    (response) => response.json() as Promise<BootstrapPayload>
  );
  const html = await fetch(`${baseUrl}/`).then((response) => response.text());

  if (health.status !== "ok") {
    throw new Error("Health route did not return ok");
  }
  if (bootstrap.workspace.id !== seedWorkspace.id || bootstrap.rooms.length < 2 || bootstrap.members.length < 4) {
    throw new Error("Seeded workspace payload is incomplete");
  }
  if (!html.includes('<div id="root">')) {
    throw new Error("Client shell HTML did not render");
  }

  console.log(
    `Boot verified: ${bootstrap.workspace.name}, rooms=${bootstrap.rooms.length}, members=${bootstrap.members.length}`
  );
} finally {
  await runtime.close();
  await rm(tempDir, { recursive: true, force: true });
}
