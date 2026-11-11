import type {
  LocalTaskProposal,
  LocalTaskProposalStatus
} from '../../shared/local-tasks/local-task-dispatcher-types'
import type { LocalTaskResult } from '../../shared/local-tasks/local-task-types'
import type { LocalTasksDatabase } from './local-tasks-database'
import { listLocalTaskProposals, readLocalTaskProposal } from './local-task-proposal-rows'

/** Claim authority lives only as long as the transport proven by the runtime. */
export class LocalTaskProposalOwnership {
  private readonly owners = new Map<string, string>()

  constructor(private readonly db: LocalTasksDatabase) {}

  ownerOf(proposalId: string): string | null {
    return this.owners.get(proposalId) ?? null
  }

  claim(proposalId: string, connectionId: string): void {
    this.owners.set(proposalId, connectionId)
  }

  release(proposalId: string): void {
    this.owners.delete(proposalId)
  }

  retire(proposalId: string, connectionId: string): void {
    if (this.owners.get(proposalId) === connectionId) {
      this.owners.delete(proposalId)
      this.db.transaction(() => this.db.touch('events'))
    }
  }

  project(proposal: LocalTaskProposal): LocalTaskProposal {
    return {
      ...proposal,
      ...(proposal.status === 'executing' ? { executionActive: this.owners.has(proposal.id) } : {})
    }
  }

  list(filter: { conversationId?: string; status?: LocalTaskProposalStatus }) {
    return {
      proposals: listLocalTaskProposals(this.db, filter).map((proposal) => this.project(proposal))
    }
  }

  result(proposalId: string): LocalTaskResult<{ proposal: LocalTaskProposal }> {
    const proposal = readLocalTaskProposal(this.db, proposalId)
    return proposal
      ? { ok: true, proposal: this.project(proposal) }
      : { ok: false, code: 'not_found' }
  }
}
