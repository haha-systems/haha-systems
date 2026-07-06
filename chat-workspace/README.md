# Chat Workspace Foundation

Greenfield chat-native agent workspace foundation for HAH-110.

## Stack

- React + Vite + TypeScript frontend
- Node.js + Express 5 + TypeScript API
- Postgres-compatible schema through Drizzle table definitions and SQL migrations
- `ws` WebSocket gateway with workspace-scoped authentication and event sequence metadata

## Local setup

```sh
npm install
npm run db:migrate
npm run dev
```

The app runs at `http://127.0.0.1:4173` by default. If `DATABASE_URL` is set, migrations apply to that Postgres database. Without `DATABASE_URL`, the app uses a local PGlite database in `.local/pglite` for development.

## Verification

```sh
npm run typecheck
npm run build
npm run verify:boot
npm run verify:ws
npm audit --audit-level=high
```

`verify:boot` starts the API against an isolated temp database and checks the seeded workspace payload plus built shell HTML. `verify:ws` starts the API against an isolated temp database, opens `/api/workspaces/:workspaceId/events/ws`, and expects a sequenced `connection.ready` event.

## Product language

Public routes and UI labels use chat-native terms: workspace, member, room, direct message, message, thread, decision, artifact, activity, and agent session. Product routes and labels intentionally avoid Paperclip task, board, approval, checkout, and lifecycle terminology.
