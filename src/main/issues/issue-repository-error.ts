export const ISSUE_REPOSITORY_ERROR_CODES = [
  'conversation_delete_blocked',
  'conversation_delete_preflight_invalid',
  'conversation_identity_conflict',
  'conversation_identity_invalid',
  'conversation_launch_claim_ambiguous',
  'conversation_launch_claim_expired',
  'conversation_launch_claim_invalid',
  'conversation_launch_claim_not_found',
  'conversation_not_found',
  'conversation_record_revision_stale',
  'conversation_retry_not_allowed',
  'issue_not_found',
  'issue_archive_blocked',
  'issue_delete_plan_invalid',
  'issue_depth_exceeded',
  'issue_snapshot_revision_stale',
  'issue_tree_revision_stale',
  'issue_record_revision_stale',
  'issue_route_invalid',
  'mutation_pending',
  'mutation_receipt_conflict',
  'parent_host_mismatch',
  'parent_cycle',
  'parent_not_found',
  'resume_workspace_mismatch',
  'round_dedupe_conflict',
  'round_not_found',
  'round_ref_conflict',
  'round_resolution_invalid'
] as const

export type IssueRepositoryErrorCode = (typeof ISSUE_REPOSITORY_ERROR_CODES)[number]

export class IssueRepositoryError extends Error {
  constructor(
    readonly code: IssueRepositoryErrorCode,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'IssueRepositoryError'
  }
}
