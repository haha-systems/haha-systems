import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import express, { type Express } from "express";
import type { WebSocket } from "ws";
import { applyMigrations } from "../db/migrate.js";
import { createSqlClient, type SqlClient } from "../db/runtime.js";
import { seedWorkspace } from "../shared/seed-data.js";
import { authenticateWorkspaceSocket, createWorkspaceGateway } from "./events.js";
import { loadBootstrap } from "./repository.js";

export interface ChatWorkspaceServer {
  app: Express;
  server: Server;
  client: SqlClient;
  close(): Promise<void>;
}

export interface CreateChatWorkspaceServerOptions {
  enableVite?: boolean;
  migrate?: boolean;
}

export async function createChatWorkspaceServer(
  opts: CreateChatWorkspaceServerOptions = {}
): Promise<ChatWorkspaceServer> {
  const client = await createSqlClient();
  if (opts.migrate !== false) {
    await applyMigrations(client);
  }

  const app = express();
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", workspaceId: seedWorkspace.id });
  });

  app.get("/api/bootstrap", async (_req, res, next) => {
    try {
      res.json(await loadBootstrap(client));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/workspaces/:workspaceId/members", async (req, res, next) => {
    try {
      const bootstrap = await loadBootstrap(client, req.params.workspaceId);
      res.json({ members: bootstrap.members });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/workspaces/:workspaceId/rooms", async (req, res, next) => {
    try {
      const bootstrap = await loadBootstrap(client, req.params.workspaceId);
      res.json({ rooms: bootstrap.rooms });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/rooms/:roomId/messages", async (req, res, next) => {
    try {
      const bootstrap = await loadBootstrap(client, String(req.query.workspaceId ?? seedWorkspace.id));
      res.json({ messages: bootstrap.messages.filter((message) => message.roomId === req.params.roomId) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/activity", async (req, res, next) => {
    try {
      const bootstrap = await loadBootstrap(client, String(req.query.workspaceId ?? seedWorkspace.id));
      res.json({ activity: bootstrap.activity });
    } catch (error) {
      next(error);
    }
  });

  if (opts.enableVite ?? process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(resolve(process.cwd(), "dist", "client")));
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(resolve(process.cwd(), "dist", "client", "index.html"));
    });
  }

  const server = createServer(app);
  const gateway = createWorkspaceGateway({
    loadBootstrap: (workspaceId: string) => loadBootstrap(client, workspaceId)
  });

  server.on("upgrade", (request, socket, head) => {
    const auth = authenticateWorkspaceSocket(request);
    if (!auth.ok) {
      socket.write(`HTTP/1.1 ${auth.status} ${auth.message}\r\n\r\n`);
      socket.destroy();
      return;
    }

    gateway.handleUpgrade(request, socket, head, (ws: WebSocket) => {
      gateway.emit("connection", ws, request, auth.workspaceId);
    });
  });

  return {
    app,
    server,
    client,
    close: async () => {
      gateway.close();
      await new Promise<void>((resolveClose, reject) => {
        server.close((error) => (error ? reject(error) : resolveClose()));
      });
      await client.close();
    }
  };
}
