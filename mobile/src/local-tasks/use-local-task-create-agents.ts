import { useEffect, useRef, useState } from 'react'
import type { MobileNewTabAgentOption } from '../session/mobile-new-tab-agent-options'
import { loadLocalTaskAgentOptions } from './local-task-agent-options'
import type { LocalTaskSite } from './local-task-endpoint'
import { readLocalTaskHostContact } from './local-task-host-contact'
import type { LocalTaskAgentChoices } from './use-local-task-launch'

export type LocalTaskCreateAgents = { status: 'idle' } | LocalTaskAgentChoices

/**
 * The agents 开工 offers on the host the task will work on (owner-relative id), read once per host
 * the user picks while the library is in contact; a host already read is not asked again. The
 * user's default comes first, as the "+" new-tab sheet lists them.
 */
export function useLocalTaskCreateAgents(
  site: LocalTaskSite | null,
  ownerHostId: string | null
): LocalTaskCreateAgents {
  const [read, setRead] = useState<{ hostId: string; agents: LocalTaskAgentChoices } | null>(null)
  const known = useRef(new Map<string, MobileNewTabAgentOption[]>())
  const launchClient = site?.client ?? null
  const pairedClient = site?.pairedClient ?? null
  useEffect(() => {
    if (!site || !launchClient || !pairedClient || !ownerHostId) {
      return
    }
    const cached = known.current.get(ownerHostId)
    if (cached) {
      setRead({ hostId: ownerHostId, agents: { status: 'ready', agents: cached } })
      return
    }
    let current = true
    const settle = (agents: LocalTaskAgentChoices) => {
      if (current) {
        setRead({ hostId: ownerHostId, agents })
      }
    }
    void readLocalTaskHostContact(launchClient, site.endpoint, ownerHostId).then((contact) => {
      if (!current) {
        return
      }
      if (contact.kind !== 'in-contact') {
        settle({
          status: 'failed',
          reason: contact.kind === 'out-of-contact' ? 'offline' : 'unverifiable'
        })
        return
      }
      void loadLocalTaskAgentOptions({
        client: pairedClient,
        launchClient,
        hostCapabilities: site.capabilities,
        target: { kind: 'create', hostId: ownerHostId }
      }).then(
        (agents) => {
          known.current.set(ownerHostId, agents)
          settle({ status: 'ready', agents })
        },
        () => settle({ status: 'failed', reason: 'read' })
      )
    })
    return () => {
      current = false
    }
    // Why keyed on the host and clients: a new host is asked once, the same one never twice.
  }, [ownerHostId, launchClient, pairedClient])
  if (!ownerHostId || !site) {
    return { status: 'idle' }
  }
  return read?.hostId === ownerHostId ? read.agents : { status: 'loading' }
}
