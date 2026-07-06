import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  seedActivity,
  seedMembers,
  seedMessages,
  seedRooms,
  seedWorkspace
} from "../shared/seed-data.js";
import type { SqlClient } from "./runtime.js";

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

export async function applyMigrations(client: SqlClient): Promise<MigrationResult> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _chat_workspace_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const migrationsDir = resolve(process.cwd(), "drizzle");
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    const existing = await client.query<{ name: string }>(
      "SELECT name FROM _chat_workspace_migrations WHERE name = $1",
      [file]
    );

    if (existing.rows.length > 0) {
      skipped.push(file);
      continue;
    }

    const sql = await readFile(join(migrationsDir, file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO _chat_workspace_migrations(name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      applied.push(file);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  await seedWorkspaceData(client);

  return { applied, skipped };
}

export async function seedWorkspaceData(client: SqlClient): Promise<void> {
  await client.query(
    `
    INSERT INTO workspaces(id, slug, name)
    VALUES ($1, $2, $3)
    ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug, name = EXCLUDED.name, updated_at = now()
    `,
    [seedWorkspace.id, seedWorkspace.slug, seedWorkspace.name]
  );

  for (const member of seedMembers) {
    await client.query(
      `
      INSERT INTO members(id, workspace_id, kind, display_name, handle, role, presence_state, timezone, last_seen_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'Europe/London', now())
      ON CONFLICT (id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        role = EXCLUDED.role,
        presence_state = EXCLUDED.presence_state,
        updated_at = now()
      `,
      [
        member.id,
        member.workspaceId,
        member.kind,
        member.displayName,
        member.handle,
        member.role,
        member.presenceState
      ]
    );

    if (member.kind === "agent") {
      await client.query(
        `
        INSERT INTO agent_profiles(
          id,
          workspace_id,
          member_id,
          adapter_type,
          model,
          instructions_ref,
          capabilities_json,
          budget_policy_json
        )
        VALUES ($1, $2, $3, 'local-adapter', 'gpt-5-codex', $4, $5::jsonb, $6::jsonb)
        ON CONFLICT (workspace_id, member_id) DO UPDATE SET
          model = EXCLUDED.model,
          capabilities_json = EXCLUDED.capabilities_json,
          budget_policy_json = EXCLUDED.budget_policy_json,
          updated_at = now()
        `,
        [
          `99999999-9999-4999-8999-${member.id.slice(-12)}`,
          member.workspaceId,
          member.id,
          `agents/${member.handle}.md`,
          JSON.stringify({ chat: true, decisions: true, artifacts: true }),
          JSON.stringify({ hourlyTokens: 50000, loopDepth: 4 })
        ]
      );
    }
  }

  for (const room of seedRooms) {
    await client.query(
      `
      INSERT INTO rooms(id, workspace_id, kind, name, topic, created_by_member_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        topic = EXCLUDED.topic,
        updated_at = now()
      `,
      [room.id, room.workspaceId, room.kind, room.name, room.topic, seedMembers[0].id]
    );

    for (const memberId of room.memberIds) {
      await client.query(
        `
        INSERT INTO room_memberships(id, workspace_id, room_id, member_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (room_id, member_id) DO NOTHING
        `,
        [`aaaaaaaa-aaaa-4aaa-8aaa-${room.id.slice(-6)}${memberId.slice(-6)}`, room.workspaceId, room.id, memberId]
      );

      if (room.kind === "dm") {
        await client.query(
          `
          INSERT INTO dm_participants(id, workspace_id, room_id, member_id)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (room_id, member_id) DO NOTHING
          `,
          [`bbbbbbbb-bbbb-4bbb-8bbb-${room.id.slice(-6)}${memberId.slice(-6)}`, room.workspaceId, room.id, memberId]
        );
      }
    }
  }

  await client.query(
    `
    INSERT INTO threads(id, workspace_id, room_id, root_message_id, state, last_activity_at)
    VALUES ($1, $2, $3, $4, 'waiting', $5)
    ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, last_activity_at = EXCLUDED.last_activity_at, updated_at = now()
    `,
    [
      "55555555-5555-4555-8555-555555555501",
      seedWorkspace.id,
      seedRooms[0].id,
      seedMessages[0].id,
      "2026-07-06T09:41:00.000Z"
    ]
  );

  for (const message of seedMessages) {
    await client.query(
      `
      INSERT INTO messages(
        id,
        workspace_id,
        room_id,
        thread_id,
        author_member_id,
        author_kind,
        body,
        body_format,
        blocks_json,
        mentions_json,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11)
      ON CONFLICT (id) DO UPDATE SET
        body = EXCLUDED.body,
        blocks_json = EXCLUDED.blocks_json,
        mentions_json = EXCLUDED.mentions_json,
        updated_at = now()
      `,
      [
        message.id,
        message.workspaceId,
        message.roomId,
        message.threadId,
        message.authorMemberId,
        message.authorKind,
        message.body,
        message.bodyFormat,
        JSON.stringify(message.blocks),
        JSON.stringify(message.mentions),
        message.createdAt
      ]
    );
  }

  await client.query(
    `
    INSERT INTO decision_blocks(
      id,
      workspace_id,
      message_id,
      thread_id,
      created_by_agent_member_id,
      kind,
      title,
      prompt,
      schema_json,
      status,
      idempotency_key,
      created_at
    )
    VALUES ($1, $2, $3, $4, $5, 'pick_one', 'pick one', $6, $7::jsonb, 'open', $8, $9)
    ON CONFLICT (workspace_id, idempotency_key) DO UPDATE SET
      prompt = EXCLUDED.prompt,
      schema_json = EXCLUDED.schema_json,
      status = EXCLUDED.status,
      updated_at = now()
    `,
    [
      "77777777-7777-4777-8777-777777777701",
      seedWorkspace.id,
      seedMessages[2].id,
      "55555555-5555-4555-8555-555555555501",
      seedMembers[1].id,
      "Which direction should Ari build out?",
      JSON.stringify({ type: "single_select", options: ["Bold type, no image", "Product shot and short headline"] }),
      "seed:hero-direction",
      "2026-07-06T09:41:00.000Z"
    ]
  );

  await client.query(
    `
    INSERT INTO artifacts(id, workspace_id, thread_id, message_id, created_by_member_id, kind, title, mime_type, preview_json, provenance_json, created_at)
    VALUES ($1, $2, $3, $4, $5, 'markdown', 'migration-sketch.md', 'text/markdown', $6::jsonb, $7::jsonb, $8)
    ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, preview_json = EXCLUDED.preview_json, updated_at = now()
    `,
    [
      "88888888-8888-4888-8888-888888888801",
      seedWorkspace.id,
      null,
      seedMessages[3].id,
      seedMembers[2].id,
      JSON.stringify({ excerpt: "Workspace isolation, wake queues, and context packs are migration-backed." }),
      JSON.stringify({ source: "seed" }),
      "2026-07-06T10:03:00.000Z"
    ]
  );

  for (const item of seedActivity) {
    await client.query(
      `
      INSERT INTO activity_items(id, workspace_id, room_id, thread_id, subject_kind, subject_id, actor_member_id, state, sort_at, summary)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, summary = EXCLUDED.summary, sort_at = EXCLUDED.sort_at, updated_at = now()
      `,
      [
        item.id,
        item.workspaceId,
        item.roomId,
        item.threadId,
        item.subjectKind,
        item.subjectId,
        item.actorMemberId,
        item.state,
        item.sortAt,
        item.summary
      ]
    );
  }
}
