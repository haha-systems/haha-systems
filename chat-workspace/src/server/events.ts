import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type { BootstrapPayload, WorkspaceEvent } from "../shared/types.js";
import { DEV_EVENT_TOKEN } from "../shared/seed-data.js";

const workspaceSequences = new Map<string, number>();

export function nextWorkspaceSequence(workspaceId: string): number {
  const next = (workspaceSequences.get(workspaceId) ?? 0) + 1;
  workspaceSequences.set(workspaceId, next);
  return next;
}

export function createWorkspaceEvent(
  workspaceId: string,
  type: string,
  payload: Record<string, unknown>
): WorkspaceEvent {
  return {
    workspaceId,
    sequence: nextWorkspaceSequence(workspaceId),
    type,
    occurredAt: new Date().toISOString(),
    payload
  };
}

export interface WorkspaceGatewayOptions {
  loadBootstrap(workspaceId: string): Promise<BootstrapPayload>;
}

export function createWorkspaceGateway(opts: WorkspaceGatewayOptions): WebSocketServer {
  const gateway = new WebSocketServer({ noServer: true });

  gateway.on("connection", async (socket: WebSocket, request: IncomingMessage, workspaceId: string) => {
    const bootstrap = await opts.loadBootstrap(workspaceId);
    const readyEvent = createWorkspaceEvent(workspaceId, "connection.ready", {
      connectionId: randomUUID(),
      rooms: bootstrap.rooms.length,
      members: bootstrap.members.length
    });

    socket.send(JSON.stringify(readyEvent));
  });

  return gateway;
}

export function authenticateWorkspaceSocket(request: IncomingMessage): {
  ok: true;
  workspaceId: string;
} | {
  ok: false;
  status: number;
  message: string;
} {
  const host = request.headers.host ?? "localhost";
  const url = new URL(request.url ?? "/", `http://${host}`);
  const match = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/events\/ws$/);

  if (!match) {
    return { ok: false, status: 404, message: "Unknown WebSocket route" };
  }

  const token = url.searchParams.get("token") ?? request.headers.authorization?.replace(/^Bearer\s+/i, "");

  if (token !== DEV_EVENT_TOKEN) {
    return { ok: false, status: 401, message: "Unauthorized workspace socket" };
  }

  return { ok: true, workspaceId: match[1] };
}
