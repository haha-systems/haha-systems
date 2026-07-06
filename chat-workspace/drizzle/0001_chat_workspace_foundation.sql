CREATE TYPE member_kind AS ENUM ('human', 'agent');
CREATE TYPE presence_state AS ENUM ('idle', 'working', 'waiting', 'offline');
CREATE TYPE room_kind AS ENUM ('channel', 'dm');
CREATE TYPE thread_state AS ENUM ('working', 'waiting', 'done');
CREATE TYPE decision_status AS ENUM ('open', 'resolved', 'expired');
CREATE TYPE wake_status AS ENUM ('queued', 'coalescing', 'running', 'completed', 'cancelled', 'failed');
CREATE TYPE agent_session_state AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');
CREATE TYPE activity_state AS ENUM ('action_needed', 'working', 'recently_done');

CREATE TABLE workspaces (
  id uuid PRIMARY KEY,
  slug varchar(80) NOT NULL UNIQUE,
  name varchar(160) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE members (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind member_kind NOT NULL,
  display_name varchar(160) NOT NULL,
  handle varchar(80) NOT NULL,
  role varchar(120),
  avatar_url text,
  timezone varchar(80),
  presence_state presence_state NOT NULL DEFAULT 'idle',
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX members_workspace_handle_idx ON members(workspace_id, handle);
CREATE INDEX members_workspace_presence_idx ON members(workspace_id, presence_state);

CREATE TABLE agent_profiles (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  adapter_type varchar(80) NOT NULL,
  model varchar(160) NOT NULL,
  instructions_ref text,
  capabilities_json jsonb NOT NULL DEFAULT '{}',
  budget_policy_json jsonb NOT NULL DEFAULT '{}',
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX agent_profiles_workspace_member_idx ON agent_profiles(workspace_id, member_id);

CREATE TABLE rooms (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind room_kind NOT NULL,
  name varchar(160) NOT NULL,
  topic text,
  created_by_member_id uuid REFERENCES members(id),
  last_message_id uuid,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX rooms_workspace_kind_idx ON rooms(workspace_id, kind);
CREATE UNIQUE INDEX rooms_workspace_name_kind_idx ON rooms(workspace_id, kind, name);

CREATE TABLE room_memberships (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  role varchar(80) NOT NULL DEFAULT 'member',
  notification_policy varchar(80) NOT NULL DEFAULT 'mentions',
  joined_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE UNIQUE INDEX room_memberships_room_member_idx ON room_memberships(room_id, member_id);
CREATE INDEX room_memberships_workspace_member_idx ON room_memberships(workspace_id, member_id);

CREATE TABLE dm_participants (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX dm_participants_room_member_idx ON dm_participants(room_id, member_id);
CREATE INDEX dm_participants_workspace_member_idx ON dm_participants(workspace_id, member_id);

CREATE TABLE threads (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  root_message_id uuid,
  state thread_state NOT NULL DEFAULT 'working',
  last_message_id uuid,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX threads_workspace_room_activity_idx ON threads(workspace_id, room_id, last_activity_at DESC);

CREATE TABLE messages (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES threads(id),
  parent_message_id uuid,
  author_member_id uuid NOT NULL REFERENCES members(id),
  author_kind member_kind NOT NULL,
  body text NOT NULL,
  body_format varchar(40) NOT NULL DEFAULT 'plain',
  blocks_json jsonb NOT NULL DEFAULT '[]',
  mentions_json jsonb NOT NULL DEFAULT '[]',
  source_client_id varchar(120),
  edit_version integer NOT NULL DEFAULT 1,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX messages_workspace_room_created_idx ON messages(workspace_id, room_id, created_at DESC, id DESC);
CREATE INDEX messages_workspace_thread_created_idx ON messages(workspace_id, thread_id, created_at ASC);

CREATE TABLE message_revisions (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  revision_number integer NOT NULL,
  body text NOT NULL,
  blocks_json jsonb NOT NULL DEFAULT '[]',
  edited_by_member_id uuid REFERENCES members(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX message_revisions_message_revision_idx ON message_revisions(message_id, revision_number);

CREATE TABLE decision_blocks (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES threads(id),
  created_by_agent_member_id uuid NOT NULL REFERENCES members(id),
  kind varchar(80) NOT NULL,
  title varchar(160) NOT NULL,
  prompt text NOT NULL,
  schema_json jsonb NOT NULL DEFAULT '{}',
  status decision_status NOT NULL DEFAULT 'open',
  idempotency_key varchar(240) NOT NULL,
  expires_at timestamptz,
  resolved_by_member_id uuid REFERENCES members(id),
  result_json jsonb,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX decision_blocks_workspace_status_created_idx ON decision_blocks(workspace_id, status, created_at DESC);
CREATE UNIQUE INDEX decision_blocks_workspace_idempotency_idx ON decision_blocks(workspace_id, idempotency_key);

CREATE TABLE decision_block_events (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  decision_block_id uuid NOT NULL REFERENCES decision_blocks(id) ON DELETE CASCADE,
  event_type varchar(80) NOT NULL,
  actor_member_id uuid REFERENCES members(id),
  payload_json jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX decision_block_events_block_created_idx ON decision_block_events(decision_block_id, created_at);

CREATE TABLE artifacts (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES threads(id),
  message_id uuid REFERENCES messages(id),
  created_by_member_id uuid NOT NULL REFERENCES members(id),
  kind varchar(80) NOT NULL,
  title varchar(180) NOT NULL,
  mime_type varchar(120),
  storage_key text,
  external_url text,
  preview_json jsonb NOT NULL DEFAULT '{}',
  provenance_json jsonb NOT NULL DEFAULT '{}',
  retention_policy varchar(80) NOT NULL DEFAULT 'workspace',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX artifacts_workspace_thread_idx ON artifacts(workspace_id, thread_id, created_at DESC);

CREATE TABLE artifact_versions (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  storage_key text,
  metadata_json jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX artifact_versions_artifact_version_idx ON artifact_versions(artifact_id, version_number);

CREATE TABLE wake_events (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  room_id uuid REFERENCES rooms(id),
  thread_id uuid REFERENCES threads(id),
  trigger_kind varchar(80) NOT NULL,
  trigger_message_id uuid REFERENCES messages(id),
  trigger_decision_block_id uuid REFERENCES decision_blocks(id),
  target_agent_member_id uuid NOT NULL REFERENCES members(id),
  routing_policy_version varchar(80) NOT NULL,
  dedupe_key varchar(240) NOT NULL,
  status wake_status NOT NULL DEFAULT 'queued',
  reason_json jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX wake_events_workspace_dedupe_active_idx
  ON wake_events(workspace_id, dedupe_key)
  WHERE status NOT IN ('completed', 'cancelled', 'failed');
CREATE INDEX wake_events_workspace_agent_status_idx ON wake_events(workspace_id, target_agent_member_id, status);

CREATE TABLE wake_batches (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  target_agent_member_id uuid NOT NULL REFERENCES members(id),
  room_id uuid REFERENCES rooms(id),
  thread_id uuid REFERENCES threads(id),
  debounce_key varchar(240) NOT NULL,
  status wake_status NOT NULL DEFAULT 'coalescing',
  coalesced_message_ids jsonb NOT NULL DEFAULT '[]',
  next_attempt_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX wake_batches_workspace_debounce_active_idx
  ON wake_batches(workspace_id, debounce_key)
  WHERE status IN ('queued', 'coalescing');
CREATE INDEX wake_batches_workspace_status_next_idx ON wake_batches(workspace_id, status, next_attempt_at);

CREATE TABLE agent_sessions (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_member_id uuid NOT NULL REFERENCES members(id),
  room_id uuid REFERENCES rooms(id),
  thread_id uuid REFERENCES threads(id),
  wake_batch_id uuid REFERENCES wake_batches(id),
  state agent_session_state NOT NULL DEFAULT 'queued',
  adapter_type varchar(80) NOT NULL,
  model varchar(160) NOT NULL,
  budget_limit_json jsonb NOT NULL DEFAULT '{}',
  usage_json jsonb NOT NULL DEFAULT '{}',
  loop_depth integer NOT NULL DEFAULT 0,
  session_ref text,
  started_at timestamptz,
  finished_at timestamptz,
  last_output_at timestamptz,
  error_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agent_sessions_workspace_agent_state_idx
  ON agent_sessions(workspace_id, agent_member_id, state, last_output_at DESC);

CREATE TABLE agent_session_events (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  event_seq integer NOT NULL,
  event_type varchar(120) NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX agent_session_events_session_seq_idx ON agent_session_events(agent_session_id, event_seq);

CREATE TABLE conversation_summaries (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES threads(id),
  agent_member_id uuid REFERENCES members(id),
  summary_kind varchar(80) NOT NULL,
  source_from_message_id uuid,
  source_to_message_id uuid,
  body text NOT NULL,
  token_count integer NOT NULL DEFAULT 0,
  invalidated_at timestamptz,
  invalidation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX conversation_summaries_workspace_room_idx
  ON conversation_summaries(workspace_id, room_id, thread_id, agent_member_id, created_at DESC);

CREATE TABLE context_packs (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  input_json jsonb NOT NULL,
  token_budget_json jsonb NOT NULL DEFAULT '{}',
  included_message_ids jsonb NOT NULL DEFAULT '[]',
  included_summary_ids jsonb NOT NULL DEFAULT '[]',
  redaction_report_json jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX context_packs_workspace_session_idx ON context_packs(workspace_id, agent_session_id);

CREATE TABLE activity_items (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  room_id uuid REFERENCES rooms(id),
  thread_id uuid REFERENCES threads(id),
  subject_kind varchar(80) NOT NULL,
  subject_id uuid NOT NULL,
  actor_member_id uuid REFERENCES members(id),
  state activity_state NOT NULL,
  sort_at timestamptz NOT NULL,
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX activity_items_workspace_state_sort_idx ON activity_items(workspace_id, state, sort_at DESC);

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_seq integer NOT NULL,
  event_type varchar(120) NOT NULL,
  aggregate_kind varchar(80) NOT NULL,
  aggregate_id uuid NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}',
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX outbox_events_workspace_seq_idx ON outbox_events(workspace_id, event_seq);
CREATE INDEX outbox_events_workspace_delivered_idx ON outbox_events(workspace_id, delivered_at);
