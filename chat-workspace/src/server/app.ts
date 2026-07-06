import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import express, { type Express } from "express";
import type { WebSocket } from "ws";
import { applyMigrations } from "../db/migrate.js";
import { createSqlClient, type SqlClient } from "../db/runtime.js";
import { seedMembers, seedWorkspace } from "../shared/seed-data.js";
import { authenticateWorkspaceSocket, createWorkspaceGateway } from "./events.js";
import {
  ChatRepositoryError,
  deleteMessage,
  editMessage,
  getMessageLimit,
  listMembersForMember,
  listRoomMessages,
  listRoomsForMember,
  listThreadMessages,
  loadBootstrap,
  sendRoomMessage,
  sendThreadReply
} from "./repository.js";

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

  const currentMemberId = (req: express.Request): string => {
    const header = req.header("x-member-id");
    const query = typeof req.query.memberId === "string" ? req.query.memberId : undefined;
    const bodyMember =
      typeof req.body === "object" && req.body !== null && typeof req.body.memberId === "string"
        ? req.body.memberId
        : undefined;
    return header ?? query ?? bodyMember ?? seedMembers[0].id;
  };

  app.get("/api/workspaces/:workspaceId/members", async (req, res, next) => {
    try {
      res.json({ members: await listMembersForMember(client, req.params.workspaceId, currentMemberId(req)) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/workspaces/:workspaceId/rooms", async (req, res, next) => {
    try {
      res.json({ rooms: await listRoomsForMember(client, req.params.workspaceId, currentMemberId(req)) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/rooms/:roomId/messages", async (req, res, next) => {
    try {
      res.json({
        messages: await listRoomMessages(client, req.params.roomId, currentMemberId(req), {
          workspaceId: String(req.query.workspaceId ?? seedWorkspace.id),
          before: typeof req.query.before === "string" ? req.query.before : undefined,
          limit: getMessageLimit(req.query.limit)
        })
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/rooms/:roomId/messages", async (req, res, next) => {
    try {
      const result = await sendRoomMessage(client, {
        roomId: req.params.roomId,
        workspaceId: typeof req.body.workspaceId === "string" ? req.body.workspaceId : seedWorkspace.id,
        authorMemberId: typeof req.body.authorMemberId === "string" ? req.body.authorMemberId : currentMemberId(req),
        body: String(req.body.body ?? ""),
        bodyFormat: req.body.bodyFormat === "markdown" ? "markdown" : "plain",
        blocks: Array.isArray(req.body.blocks) ? req.body.blocks : [],
        mentions: Array.isArray(req.body.mentions) ? req.body.mentions.map(String) : [],
        sourceClientId: typeof req.body.sourceClientId === "string" ? req.body.sourceClientId : undefined
      });
      for (const event of result.events) {
        gateway.publish(event);
      }
      res.status(result.idempotent ? 200 : 201).json({ message: result.message, idempotent: Boolean(result.idempotent) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/threads/:threadId/messages", async (req, res, next) => {
    try {
      res.json({
        messages: await listThreadMessages(client, req.params.threadId, currentMemberId(req), {
          before: typeof req.query.before === "string" ? req.query.before : undefined,
          limit: getMessageLimit(req.query.limit)
        })
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/messages/:messageId/replies", async (req, res, next) => {
    try {
      const result = await sendThreadReply(client, {
        parentMessageId: req.params.messageId,
        authorMemberId: typeof req.body.authorMemberId === "string" ? req.body.authorMemberId : currentMemberId(req),
        body: String(req.body.body ?? ""),
        bodyFormat: req.body.bodyFormat === "markdown" ? "markdown" : "plain",
        blocks: Array.isArray(req.body.blocks) ? req.body.blocks : [],
        mentions: Array.isArray(req.body.mentions) ? req.body.mentions.map(String) : [],
        sourceClientId: typeof req.body.sourceClientId === "string" ? req.body.sourceClientId : undefined
      });
      for (const event of result.events) {
        gateway.publish(event);
      }
      res.status(result.idempotent ? 200 : 201).json({ message: result.message, idempotent: Boolean(result.idempotent) });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/messages/:messageId", async (req, res, next) => {
    try {
      const result = await editMessage(client, {
        messageId: req.params.messageId,
        editorMemberId:
          typeof req.body.editorMemberId === "string"
            ? req.body.editorMemberId
            : typeof req.body.authorMemberId === "string"
              ? req.body.authorMemberId
              : currentMemberId(req),
        body: String(req.body.body ?? ""),
        blocks: Array.isArray(req.body.blocks) ? req.body.blocks : undefined,
        mentions: Array.isArray(req.body.mentions) ? req.body.mentions.map(String) : undefined
      });
      for (const event of result.events) {
        gateway.publish(event);
      }
      res.json({ message: result.message });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/messages/:messageId", async (req, res, next) => {
    try {
      const result = await deleteMessage(client, {
        messageId: req.params.messageId,
        deletedByMemberId:
          typeof req.body?.deletedByMemberId === "string"
            ? req.body.deletedByMemberId
            : typeof req.body?.authorMemberId === "string"
              ? req.body.authorMemberId
              : currentMemberId(req),
        reason: typeof req.body?.reason === "string" ? req.body.reason : undefined
      });
      for (const event of result.events) {
        gateway.publish(event);
      }
      res.json({ message: result.message });
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

  app.use("/api", (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof ChatRepositoryError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
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
