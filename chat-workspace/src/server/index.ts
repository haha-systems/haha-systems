import { createChatWorkspaceServer } from "./app.js";

const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? "127.0.0.1";
const runtime = await createChatWorkspaceServer();

runtime.server.listen(port, host, () => {
  console.log(`Chat workspace listening at http://${host}:${port}`);
});

const shutdown = async () => {
  await runtime.close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
