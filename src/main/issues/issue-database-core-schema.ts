export const ISSUE_DATABASE_CORE_SCHEMA = `
CREATE TABLE issue_authority_meta (
  singleton    INTEGER PRIMARY KEY CHECK(singleton = 1),
  authority_id TEXT NOT NULL UNIQUE,
  created_at   INTEGER NOT NULL
);

CREATE TABLE issue_host_state (
  host_partition_key      TEXT PRIMARY KEY CHECK(
                            host_partition_key = 'local' OR
                            host_partition_key GLOB 'ssh:?*'
                          ),
  next_local_issue_number INTEGER NOT NULL DEFAULT 1
                          CHECK(next_local_issue_number >= 1),
  facts_revision          INTEGER NOT NULL DEFAULT 0 CHECK(facts_revision >= 0),
  tree_revision           INTEGER NOT NULL DEFAULT 0 CHECK(tree_revision >= 0),
  updated_at              INTEGER NOT NULL
);

CREATE TABLE issues (
  id                 TEXT PRIMARY KEY,
  host_partition_key TEXT NOT NULL CHECK(
                       host_partition_key = 'local' OR
                       host_partition_key GLOB 'ssh:?*'
                     ),
  execution_host_id  TEXT NOT NULL CHECK(execution_host_id = host_partition_key),
  source_kind        TEXT NOT NULL CHECK(source_kind IN ('local', 'external')),
  source_provider    TEXT CHECK(
                       source_provider IS NULL OR
                       source_provider IN ('github', 'gitlab', 'linear', 'jira', 'other')
                     ),
  source_identifier  TEXT,
  source_url         TEXT,
  source_title       TEXT,
  local_number       INTEGER,
  local_title        TEXT,
  type_label         TEXT,
  note               TEXT,
  state              TEXT NOT NULL CHECK(state IN ('active', 'archived')),
  parent_id          TEXT REFERENCES issues(id) ON DELETE RESTRICT,
  sibling_order      INTEGER NOT NULL CHECK(sibling_order >= 0),
  record_revision    INTEGER NOT NULL DEFAULT 0 CHECK(record_revision >= 0),
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  archived_at        INTEGER,
  CHECK (
    (source_kind = 'local' AND local_title IS NOT NULL AND local_number IS NOT NULL
                           AND source_provider IS NULL AND source_identifier IS NULL
                           AND source_url IS NULL AND source_title IS NULL) OR
    (source_kind = 'external' AND local_title IS NULL AND local_number IS NULL
                              AND source_provider IS NOT NULL
                              AND source_identifier IS NOT NULL
                              AND source_url IS NOT NULL
                              AND source_title IS NOT NULL)
  )
);
CREATE UNIQUE INDEX idx_issues_local_number
  ON issues(host_partition_key, local_number) WHERE source_kind = 'local';
CREATE INDEX idx_issues_parent_order
  ON issues(host_partition_key, parent_id, sibling_order);
CREATE INDEX idx_issues_state
  ON issues(host_partition_key, state, updated_at DESC);

CREATE TRIGGER issues_execution_host_immutable
BEFORE UPDATE OF execution_host_id, host_partition_key ON issues
WHEN NEW.execution_host_id <> OLD.execution_host_id
  OR NEW.host_partition_key <> OLD.host_partition_key
BEGIN
  SELECT RAISE(ABORT, 'issue_execution_host_immutable');
END;

CREATE TRIGGER issues_parent_same_host_insert
BEFORE INSERT ON issues
WHEN NEW.parent_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM issues parent
    WHERE parent.id = NEW.parent_id
      AND parent.host_partition_key = NEW.host_partition_key
      AND parent.execution_host_id = NEW.execution_host_id
  )
BEGIN
  SELECT RAISE(ABORT, 'issue_parent_host_mismatch');
END;

CREATE TRIGGER issues_parent_same_host_update
BEFORE UPDATE OF parent_id ON issues
WHEN NEW.parent_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM issues parent
    WHERE parent.id = NEW.parent_id
      AND parent.host_partition_key = NEW.host_partition_key
      AND parent.execution_host_id = NEW.execution_host_id
  )
BEGIN
  SELECT RAISE(ABORT, 'issue_parent_host_mismatch');
END;

CREATE TABLE conversations (
  id                      TEXT PRIMARY KEY,
  host_partition_key      TEXT NOT NULL CHECK(
                            host_partition_key = 'local' OR
                            host_partition_key GLOB 'ssh:?*'
                          ),
  execution_host_id       TEXT NOT NULL CHECK(execution_host_id = host_partition_key),
  workspace_kind          TEXT NOT NULL CHECK(workspace_kind IN ('worktree', 'folder')),
  workspace_id            TEXT NOT NULL,
  workspace_name_snapshot TEXT NOT NULL,
  workspace_path_snapshot TEXT NOT NULL,
  agent                   TEXT NOT NULL,
  title                   TEXT,
  title_source            TEXT CHECK(
                            title_source IS NULL OR
                            title_source IN ('minted', 'provider', 'user')
                          ),
  issue_id                TEXT REFERENCES issues(id) ON DELETE RESTRICT,
  record_revision         INTEGER NOT NULL DEFAULT 0 CHECK(record_revision >= 0),
  launch_failure_message  TEXT,
  launch_failed_at        INTEGER,
  created_at              INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL,
  CHECK(
    (launch_failure_message IS NULL AND launch_failed_at IS NULL) OR
    (launch_failure_message IS NOT NULL AND launch_failed_at IS NOT NULL)
  )
);
CREATE INDEX idx_conversations_workspace
  ON conversations(host_partition_key, workspace_kind, workspace_id, updated_at DESC);
CREATE INDEX idx_conversations_issue
  ON conversations(issue_id, updated_at DESC);

CREATE TRIGGER conversations_execution_host_immutable
BEFORE UPDATE OF execution_host_id, host_partition_key ON conversations
WHEN NEW.execution_host_id <> OLD.execution_host_id
  OR NEW.host_partition_key <> OLD.host_partition_key
BEGIN
  SELECT RAISE(ABORT, 'conversation_execution_host_immutable');
END;

CREATE TRIGGER conversations_workspace_immutable
BEFORE UPDATE OF workspace_kind, workspace_id ON conversations
WHEN NEW.workspace_kind <> OLD.workspace_kind OR NEW.workspace_id <> OLD.workspace_id
BEGIN
  SELECT RAISE(ABORT, 'conversation_workspace_immutable');
END;

CREATE TRIGGER conversations_issue_same_host_insert
BEFORE INSERT ON conversations
WHEN NEW.issue_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM issues issue
    WHERE issue.id = NEW.issue_id
      AND issue.host_partition_key = NEW.host_partition_key
      AND issue.execution_host_id = NEW.execution_host_id
  )
BEGIN
  SELECT RAISE(ABORT, 'conversation_issue_host_mismatch');
END;

CREATE TRIGGER conversations_issue_same_host_update
BEFORE UPDATE OF issue_id ON conversations
WHEN NEW.issue_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM issues issue
    WHERE issue.id = NEW.issue_id
      AND issue.host_partition_key = NEW.host_partition_key
      AND issue.execution_host_id = NEW.execution_host_id
  )
BEGIN
  SELECT RAISE(ABORT, 'conversation_issue_host_mismatch');
END;

CREATE TABLE conversation_provider_identities (
  id                   TEXT PRIMARY KEY,
  conversation_id      TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  host_partition_key   TEXT NOT NULL,
  agent                TEXT NOT NULL,
  session_key          TEXT NOT NULL CHECK(session_key IN ('session_id', 'conversation_id')),
  session_id           TEXT NOT NULL,
  transcript_path      TEXT,
  identity_fingerprint TEXT NOT NULL,
  resume_locator       TEXT,
  observed_at          INTEGER NOT NULL,
  retired_at           INTEGER
);
CREATE UNIQUE INDEX idx_provider_identity_active
  ON conversation_provider_identities(host_partition_key, agent, identity_fingerprint)
  WHERE retired_at IS NULL;
CREATE INDEX idx_provider_identity_conversation
  ON conversation_provider_identities(conversation_id, observed_at DESC);

CREATE TRIGGER provider_identity_host_insert
BEFORE INSERT ON conversation_provider_identities
WHEN NOT EXISTS (
  SELECT 1 FROM conversations conversation
  WHERE conversation.id = NEW.conversation_id
    AND conversation.host_partition_key = NEW.host_partition_key
)
BEGIN
  SELECT RAISE(ABORT, 'provider_identity_host_mismatch');
END;

CREATE TRIGGER provider_identity_host_update
BEFORE UPDATE OF conversation_id, host_partition_key ON conversation_provider_identities
WHEN NOT EXISTS (
  SELECT 1 FROM conversations conversation
  WHERE conversation.id = NEW.conversation_id
    AND conversation.host_partition_key = NEW.host_partition_key
)
BEGIN
  SELECT RAISE(ABORT, 'provider_identity_host_mismatch');
END;

CREATE TABLE conversation_launch_claims (
  claim_id            TEXT PRIMARY KEY,
  conversation_id     TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  host_partition_key  TEXT NOT NULL,
  launch_token_hash   TEXT NOT NULL,
  pane_key            TEXT,
  process_incarnation TEXT,
  connection_id       TEXT,
  created_at          INTEGER NOT NULL,
  expires_at          INTEGER NOT NULL,
  settled_at          INTEGER,
  settlement          TEXT CHECK(settlement IN ('attached', 'failed', 'expired', 'retired')),
  CHECK(
    (settled_at IS NULL AND settlement IS NULL) OR
    (settled_at IS NOT NULL AND settlement IS NOT NULL)
  )
);
CREATE UNIQUE INDEX idx_launch_claim_pending_token
  ON conversation_launch_claims(host_partition_key, launch_token_hash)
  WHERE settled_at IS NULL;
CREATE INDEX idx_launch_claim_conversation
  ON conversation_launch_claims(conversation_id, created_at DESC);

CREATE TRIGGER launch_claim_host_insert
BEFORE INSERT ON conversation_launch_claims
WHEN NOT EXISTS (
  SELECT 1 FROM conversations conversation
  WHERE conversation.id = NEW.conversation_id
    AND conversation.host_partition_key = NEW.host_partition_key
)
BEGIN
  SELECT RAISE(ABORT, 'launch_claim_host_mismatch');
END;

CREATE TRIGGER launch_claim_host_update
BEFORE UPDATE OF conversation_id, host_partition_key ON conversation_launch_claims
WHEN NOT EXISTS (
  SELECT 1 FROM conversations conversation
  WHERE conversation.id = NEW.conversation_id
    AND conversation.host_partition_key = NEW.host_partition_key
)
BEGIN
  SELECT RAISE(ABORT, 'launch_claim_host_mismatch');
END;

CREATE TABLE issue_mutation_receipts (
  caller_fingerprint TEXT NOT NULL,
  mutation_id        TEXT NOT NULL,
  method             TEXT NOT NULL,
  payload_hash       TEXT NOT NULL,
  state              TEXT NOT NULL CHECK(state IN ('pending', 'completed')),
  result_json        TEXT,
  created_at         INTEGER NOT NULL,
  completed_at       INTEGER,
  PRIMARY KEY(caller_fingerprint, mutation_id),
  CHECK(
    (state = 'pending' AND result_json IS NULL AND completed_at IS NULL) OR
    (state = 'completed' AND result_json IS NOT NULL AND completed_at IS NOT NULL)
  )
);
`
