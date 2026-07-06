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
  createAgent,
  createArtifact,
  createDecisionBlock,
  deleteMessage,
  editMessage,
  getVisibleArtifact,
  getMessageLimit,
  listAgentsForMember,
  listArtifactsForMember,
  listDecisionBlocks,
  listMembersForMember,
  listRoomMessages,
  listRoomsForMember,
  listThreadMessages,
  loadBootstrap,
  removeAgent,
  resolveDecisionBlock,
  sendRoomMessage,
  sendThreadReply,
  updateAgent
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

  const currentMemberId = (req: express.Request): string => {
    const header = req.header("x-member-id");
    const query = typeof req.query.memberId === "string" ? req.query.memberId : undefined;
    const bodyMember =
      typeof req.body === "object" && req.body !== null && typeof req.body.memberId === "string"
        ? req.body.memberId
        : undefined;
    return header ?? query ?? bodyMember ?? seedMembers[0].id;
  };

  const objectBody = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

  app.get("/api/bootstrap", async (req, res, next) => {
    try {
      res.json(await loadBootstrap(client, seedWorkspace.id, currentMemberId(req)));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/workspaces/:workspaceId/members", async (req, res, next) => {
    try {
      res.json({ members: await listMembersForMember(client, req.params.workspaceId, currentMemberId(req)) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/workspaces/:workspaceId/agents", async (req, res, next) => {
    try {
      res.json({ agents: await listAgentsForMember(client, req.params.workspaceId, currentMemberId(req)) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/workspaces/:workspaceId/agents", async (req, res, next) => {
    try {
      const result = await createAgent(client, {
        workspaceId: req.params.workspaceId,
        createdByMemberId:
          typeof req.body.createdByMemberId === "string" ? req.body.createdByMemberId : currentMemberId(req),
        displayName: String(req.body.displayName ?? ""),
        handle: String(req.body.handle ?? ""),
        role: req.body.role === null || typeof req.body.role === "string" ? req.body.role : undefined,
        avatarUrl: req.body.avatarUrl === null || typeof req.body.avatarUrl === "string" ? req.body.avatarUrl : undefined,
        timezone: req.body.timezone === null || typeof req.body.timezone === "string" ? req.body.timezone : undefined,
        adapterType: typeof req.body.adapterType === "string" ? req.body.adapterType : undefined,
        model: typeof req.body.model === "string" ? req.body.model : undefined,
        instructionsRef:
          req.body.instructionsRef === null || typeof req.body.instructionsRef === "string"
            ? req.body.instructionsRef
            : undefined,
        capabilities: objectBody(req.body.capabilities),
        budgetPolicy: objectBody(req.body.budgetPolicy),
        isEnabled: typeof req.body.isEnabled === "boolean" ? req.body.isEnabled : undefined
      });
      for (const event of result.events) {
        gateway.publish(event);
      }
      res.status(201).json({ agent: result.agent });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/workspaces/:workspaceId/agents/:memberId", async (req, res, next) => {
    try {
      const result = await updateAgent(client, {
        workspaceId: req.params.workspaceId,
        memberId: req.params.memberId,
        updatedByMemberId:
          typeof req.body.updatedByMemberId === "string" ? req.body.updatedByMemberId : currentMemberId(req),
        displayName: typeof req.body.displayName === "string" ? req.body.displayName : undefined,
        handle: typeof req.body.handle === "string" ? req.body.handle : undefined,
        role: req.body.role === null || typeof req.body.role === "string" ? req.body.role : undefined,
        avatarUrl: req.body.avatarUrl === null || typeof req.body.avatarUrl === "string" ? req.body.avatarUrl : undefined,
        timezone: req.body.timezone === null || typeof req.body.timezone === "string" ? req.body.timezone : undefined,
        adapterType: typeof req.body.adapterType === "string" ? req.body.adapterType : undefined,
        model: typeof req.body.model === "string" ? req.body.model : undefined,
        instructionsRef:
          req.body.instructionsRef === null || typeof req.body.instructionsRef === "string"
            ? req.body.instructionsRef
            : undefined,
        capabilities:
          req.body.capabilities && typeof req.body.capabilities === "object" && !Array.isArray(req.body.capabilities)
            ? req.body.capabilities
            : undefined,
        budgetPolicy:
          req.body.budgetPolicy && typeof req.body.budgetPolicy === "object" && !Array.isArray(req.body.budgetPolicy)
            ? req.body.budgetPolicy
            : undefined,
        isEnabled: typeof req.body.isEnabled === "boolean" ? req.body.isEnabled : undefined
      });
      for (const event of result.events) {
        gateway.publish(event);
      }
      res.json({ agent: result.agent });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/workspaces/:workspaceId/agents/:memberId/reactivate", async (req, res, next) => {
    try {
      const result = await updateAgent(client, {
        workspaceId: req.params.workspaceId,
        memberId: req.params.memberId,
        updatedByMemberId:
          typeof req.body.updatedByMemberId === "string" ? req.body.updatedByMemberId : currentMemberId(req),
        isEnabled: true
      });
      for (const event of result.events) {
        gateway.publish(event);
      }
      res.json({ agent: result.agent });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/workspaces/:workspaceId/agents/:memberId", async (req, res, next) => {
    try {
      const result = await removeAgent(client, req.params.workspaceId, req.params.memberId, currentMemberId(req));
      for (const event of result.events) {
        gateway.publish(event);
      }
      res.json({ agent: result.agent, historyPreserved: true });
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

  app.get("/api/workspaces/:workspaceId/artifacts", async (req, res, next) => {
    try {
      res.json({
        artifacts: await listArtifactsForMember(client, req.params.workspaceId, currentMemberId(req), {
          messageId: typeof req.query.messageId === "string" ? req.query.messageId : undefined,
          threadId: typeof req.query.threadId === "string" ? req.query.threadId : undefined,
          limit: getMessageLimit(req.query.limit)
        })
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/artifacts/:artifactId", async (req, res, next) => {
    try {
      res.json({ artifact: await getVisibleArtifact(client, req.params.artifactId, currentMemberId(req)) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/artifacts", async (req, res, next) => {
    try {
      const result = await createArtifact(client, {
        workspaceId: typeof req.body.workspaceId === "string" ? req.body.workspaceId : seedWorkspace.id,
        messageId: typeof req.body.messageId === "string" ? req.body.messageId : undefined,
        threadId: typeof req.body.threadId === "string" ? req.body.threadId : undefined,
        createdByMemberId:
          typeof req.body.createdByMemberId === "string" ? req.body.createdByMemberId : currentMemberId(req),
        kind: req.body.kind,
        title: String(req.body.title ?? ""),
        mimeType: typeof req.body.mimeType === "string" ? req.body.mimeType : undefined,
        storageKey: typeof req.body.storageKey === "string" ? req.body.storageKey : undefined,
        externalUrl: typeof req.body.externalUrl === "string" ? req.body.externalUrl : undefined,
        preview: req.body.preview && typeof req.body.preview === "object" && !Array.isArray(req.body.preview)
          ? req.body.preview
          : {},
        provenance:
          req.body.provenance && typeof req.body.provenance === "object" && !Array.isArray(req.body.provenance)
            ? req.body.provenance
            : {},
        retentionPolicy: typeof req.body.retentionPolicy === "string" ? req.body.retentionPolicy : undefined
      });
      for (const event of result.events) {
        gateway.publish(event);
      }
      res.status(201).json({ artifact: result.artifact });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/workspaces/:workspaceId/decision-blocks", async (req, res, next) => {
    try {
      res.json({
        decisionBlocks: await listDecisionBlocks(client, req.params.workspaceId, currentMemberId(req), {
          status:
            req.query.status === "open" || req.query.status === "resolved" || req.query.status === "expired"
              ? req.query.status
              : undefined,
          messageId: typeof req.query.messageId === "string" ? req.query.messageId : undefined,
          threadId: typeof req.query.threadId === "string" ? req.query.threadId : undefined
        })
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/messages/:messageId/decision-blocks", async (req, res, next) => {
    try {
      if (req.body.kind !== "approve_reject" && req.body.kind !== "short_question" && req.body.kind !== "pick_one") {
        throw new ChatRepositoryError("Decision kind must be approve_reject, short_question, or pick_one", 422);
      }
      const result = await createDecisionBlock(client, {
        messageId: req.params.messageId,
        createdByAgentMemberId:
          typeof req.body.createdByAgentMemberId === "string"
            ? req.body.createdByAgentMemberId
            : typeof req.body.authorMemberId === "string"
              ? req.body.authorMemberId
              : currentMemberId(req),
        kind: req.body.kind,
        title: String(req.body.title ?? ""),
        prompt: String(req.body.prompt ?? ""),
        schema:
          req.body.schema && typeof req.body.schema === "object" && !Array.isArray(req.body.schema)
            ? req.body.schema
            : {},
        idempotencyKey: typeof req.body.idempotencyKey === "string" ? req.body.idempotencyKey : undefined,
        expiresAt: typeof req.body.expiresAt === "string" ? req.body.expiresAt : undefined
      });
      for (const event of result.events) {
        gateway.publish(event);
      }
      res.status(result.idempotent ? 200 : 201).json({
        decisionBlock: result.decisionBlock,
        message: result.message,
        idempotent: Boolean(result.idempotent)
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/decision-blocks/:decisionBlockId/resolve", async (req, res, next) => {
    try {
      const result = await resolveDecisionBlock(client, {
        decisionBlockId: req.params.decisionBlockId,
        resolvedByMemberId:
          typeof req.body.resolvedByMemberId === "string"
            ? req.body.resolvedByMemberId
            : typeof req.body.memberId === "string"
              ? req.body.memberId
              : currentMemberId(req),
        result:
          req.body.result && typeof req.body.result === "object" && !Array.isArray(req.body.result)
            ? req.body.result
            : {},
        expectedUpdatedAt: typeof req.body.expectedUpdatedAt === "string" ? req.body.expectedUpdatedAt : undefined
      });
      for (const event of result.events) {
        gateway.publish(event);
      }
      res.json({ decisionBlock: result.decisionBlock, message: result.message, wakeEvent: result.wakeEvent });
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
      const bootstrap = await loadBootstrap(
        client,
        String(req.query.workspaceId ?? seedWorkspace.id),
        currentMemberId(req)
      );
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
