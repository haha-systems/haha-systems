CREATE TABLE IF NOT EXISTS message_tombstones (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  deleted_by_member_id uuid REFERENCES members(id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS message_tombstones_message_idx ON message_tombstones(message_id);

CREATE UNIQUE INDEX IF NOT EXISTS messages_workspace_room_source_client_idx
  ON messages(workspace_id, room_id, source_client_id)
  WHERE source_client_id IS NOT NULL;
