export const ISSUE_DATABASE_ROUND_SCHEMA = `
CREATE TABLE round_records (
  id                       TEXT PRIMARY KEY,
  conversation_id          TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  kind                     TEXT NOT NULL CHECK(kind IN ('completion', 'waiting')),
  waiting_reason           TEXT CHECK(
                             (kind = 'completion' AND waiting_reason IS NULL) OR
                             (kind = 'waiting' AND waiting_reason IN (
                               'question', 'approval', 'blocked', 'other'
                             ))
                           ),
  state_source             TEXT NOT NULL CHECK(state_source IN ('hook', 'reconciled')),
  occurred_at              INTEGER NOT NULL,
  dedupe_key               TEXT NOT NULL UNIQUE,
  user_input_preview       TEXT,
  user_input_completeness  TEXT NOT NULL CHECK(user_input_completeness IN (
                             'not-captured', 'runtime-preview', 'reconciled-preview'
                           )),
  agent_output_preview     TEXT,
  output_completeness      TEXT NOT NULL CHECK(output_completeness IN (
                             'not-captured', 'runtime-preview', 'reconciled-preview'
                           )),
  pending_question_preview TEXT,
  question_completeness    TEXT NOT NULL CHECK(question_completeness IN (
                             'not-captured', 'runtime-preview', 'reconciled-preview'
                           )),
  read_at                  INTEGER,
  resolved_at              INTEGER,
  resolution               TEXT CHECK(
                             resolution IS NULL OR
                             resolution IN ('new-input', 'explicit', 'archive', 'resumed')
                           ),
  created_at               INTEGER NOT NULL,
  CHECK(
    (resolved_at IS NULL AND resolution IS NULL) OR
    (resolved_at IS NOT NULL AND resolution IS NOT NULL)
  )
);
CREATE INDEX idx_rounds_conversation
  ON round_records(conversation_id, occurred_at DESC, id);
CREATE INDEX idx_rounds_unresolved
  ON round_records(conversation_id, kind, occurred_at DESC)
  WHERE resolved_at IS NULL;

CREATE TABLE round_refs (
  round_id  TEXT NOT NULL REFERENCES round_records(id) ON DELETE CASCADE,
  ref_kind  TEXT NOT NULL,
  value     TEXT NOT NULL,
  reachable INTEGER,
  PRIMARY KEY(round_id, ref_kind, value)
);
CREATE UNIQUE INDEX idx_round_provider_turn_ref
  ON round_refs(ref_kind, value) WHERE ref_kind = 'provider-turn';
`
