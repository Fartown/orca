import type { AgentPaneThread } from '../components/activity/threads/activity-thread-types'

/**
 * Fork (session-names): public names React resolved, laid over the threads a non-React reader
 * builds. A thread keeps its identity while its source and its public name are unchanged.
 */
export function createPublishedAgentThreadTitles() {
  let titles = new Map<string, string>()
  const namedBySource = new WeakMap<AgentPaneThread, AgentPaneThread>()
  let list = { source: [] as readonly AgentPaneThread[], titles, named: [] as AgentPaneThread[] }

  function apply(thread: AgentPaneThread): AgentPaneThread {
    const title = titles.get(thread.paneKey)
    if (title === undefined || title === thread.paneTitle) {
      return thread
    }
    let named = namedBySource.get(thread)
    if (named?.paneTitle !== title) {
      named = { ...thread, paneTitle: title }
      namedBySource.set(thread, named)
    }
    return named
  }

  return {
    /** Takes the names of the threads React renamed; returns the panes whose public name changed. */
    replace(projected: readonly AgentPaneThread[], named: readonly AgentPaneThread[]): string[] {
      const next = new Map<string, string>()
      named.forEach((thread, index) => {
        if (thread !== projected[index]) {
          next.set(thread.paneKey, thread.paneTitle)
        }
      })
      const changed: string[] = []
      for (const [paneKey, title] of next) {
        if (titles.get(paneKey) !== title) {
          changed.push(paneKey)
        }
      }
      for (const paneKey of titles.keys()) {
        if (!next.has(paneKey)) {
          changed.push(paneKey)
        }
      }
      if (changed.length > 0) {
        titles = next
      }
      return changed
    },
    apply,
    applyAll(threads: readonly AgentPaneThread[]): readonly AgentPaneThread[] {
      if (titles.size === 0) {
        return threads
      }
      if (list.source !== threads || list.titles !== titles) {
        list = { source: threads, titles, named: threads.map(apply) }
      }
      return list.named
    }
  }
}
