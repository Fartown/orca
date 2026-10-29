import {
  localTaskRowWords,
  type LocalTaskStatusRow
} from '../../shared/local-tasks/local-task-attention-rules'

/**
 * What the judge remembers per pane between reports, held only for panes a linked session holds:
 * a pane no link names is forgotten, so unlinked or deleted work never stays in memory.
 */
export class LocalTaskPaneMemory {
  /** Last prose per pane, so a session keeps its words once the agent moves on to a tool. */
  private readonly prose = new Map<string, string>()
  /** Panes that reported this process: their row vanishing means the agent ended or the tab closed. */
  private readonly reported = new Set<string>()

  heard(paneKey: string, row: LocalTaskStatusRow): void {
    this.reported.add(paneKey)
    // Why the rule's own cut: a remembered message is stored no longer than it is ever shown.
    const words = localTaskRowWords(row, null)
    if (words) {
      this.prose.set(paneKey, words)
    }
  }

  proseOf(paneKey: string): string | null {
    return this.prose.get(paneKey) ?? null
  }

  hasReported(paneKey: string): boolean {
    return this.reported.has(paneKey)
  }

  keepOnly(paneKeys: Iterable<string | null>): void {
    const held = new Set(paneKeys)
    for (const paneKey of this.reported) {
      if (!held.has(paneKey)) {
        this.reported.delete(paneKey)
        this.prose.delete(paneKey)
      }
    }
  }

  clear(): void {
    this.prose.clear()
    this.reported.clear()
  }
}
