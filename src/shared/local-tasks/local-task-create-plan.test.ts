import { describe, expect, it } from 'vitest'
import {
  localTaskCreateBlock,
  localTaskCreatePlan,
  localTaskCreatePlanReady,
  localTaskCreateProjectFor,
  localTaskCreateQueryMatches,
  localTaskCreateStartsSession,
  localTaskKickoffPromptText
} from './local-task-create-plan'

const shop = { id: 'shop', repos: ['orca-shop'] }
const orc = { id: 'orc', repos: ['orca-orca'] }
const inbox = { id: 'inbox', repos: [] }

describe('New task places a task where it will work (REQ-027)', () => {
  const free = { held: false, owner: null, projects: [shop, orc] }

  it('keeps the current project when it tracks the repository, else takes the one that does', () => {
    const orcaRepo = new Set(['orca-orca'])
    expect(
      localTaskCreateProjectFor({ ...free, currentProjectId: 'orc', orcaProjectIds: orcaRepo })
    ).toBe('orc')
    expect(
      localTaskCreateProjectFor({ ...free, currentProjectId: 'shop', orcaProjectIds: orcaRepo })
    ).toBe('orc')
  })

  it('keeps the current project for a repository nobody tracks, or when it tracks none', () => {
    const infra = new Set(['orca-infra'])
    expect(
      localTaskCreateProjectFor({ ...free, currentProjectId: 'shop', orcaProjectIds: infra })
    ).toBe('shop')
    expect(
      localTaskCreateProjectFor({
        ...free,
        projects: [inbox, orc],
        currentProjectId: 'inbox',
        orcaProjectIds: new Set(['orca-orca'])
      })
    ).toBe('inbox')
  })

  it('puts a task in a held workspace into the holder’s project, or nowhere it can’t write', () => {
    const args = { held: true, currentProjectId: 'shop', orcaProjectIds: new Set(['orca-orca']) }
    expect(
      localTaskCreateProjectFor({ ...args, owner: { projectId: 'orc' }, projects: [shop, orc] })
    ).toBe('orc')
    expect(
      localTaskCreateProjectFor({ ...args, owner: { projectId: 'orc' }, projects: [shop] })
    ).toBeNull()
    // The holder's task isn't loaded: nothing says which project could take its subtask.
    expect(localTaskCreateProjectFor({ ...args, owner: null, projects: [shop, orc] })).toBeNull()
  })

  it('blocks only on a host said to be out of contact, then on no project', () => {
    expect(localTaskCreateBlock({ hostConnected: false, projectId: 'shop' })).toBe('host-offline')
    expect(localTaskCreateBlock({ hostConnected: false, projectId: null })).toBe('host-offline')
    expect(localTaskCreateBlock({ hostConnected: null, projectId: null })).toBe('no-project')
    expect(localTaskCreateBlock({ hostConnected: null, projectId: 'shop' })).toBeNull()
  })

  it('matches every word of a search across the row’s fields', () => {
    const fields = ['refund-webhook', 'main', 'shop', 'minizc', null]
    expect(localTaskCreateQueryMatches(fields, 'shop refund')).toBe(true)
    expect(localTaskCreateQueryMatches(fields, 'shop dbox')).toBe(false)
    expect(localTaskCreateQueryMatches(fields, '  ')).toBe(true)
  })
})

describe('New task says what the primary button will do (REQ-027)', () => {
  const existing = { workspace: 'refund-webhook', host: 'minizc', parentRef: null }
  const fresh = { workspace: '', host: 'minizc' }
  const base = { existing: null, fresh: null, agent: 'Claude', agentsPending: false }

  it('asks for a place before it can create there', () => {
    const pick = localTaskCreatePlan({ ...base, where: 'existing' })
    expect(pick).toEqual({ kind: 'pick-workspace' })
    expect(localTaskCreatePlanReady(pick)).toBe(false)
    expect(localTaskCreatePlan({ ...base, where: 'new' })).toEqual({ kind: 'pick-repo' })
    expect(localTaskCreatePlanReady(localTaskCreatePlan({ ...base, where: 'later' }))).toBe(true)
  })

  it('waits for the host’s agents, then names the session and the place', () => {
    const waiting = localTaskCreatePlan({
      ...base,
      where: 'existing',
      existing,
      agentsPending: true
    })
    expect(waiting).toEqual({ kind: 'finding-agents' })
    expect(localTaskCreatePlanReady(waiting)).toBe(false)
    expect(
      localTaskCreatePlan({
        ...base,
        where: 'existing',
        existing: { ...existing, parentRef: 'SHOP-12' }
      })
    ).toEqual({ kind: 'existing', ...existing, parentRef: 'SHOP-12', agent: 'Claude' })
    expect(localTaskCreatePlan({ ...base, where: 'new', fresh, agent: null })).toEqual({
      kind: 'new',
      ...fresh,
      agent: null
    })
  })

  it('reads 创建并开工 only when a session opens, and keeps it while agents load', () => {
    expect(
      localTaskCreateStartsSession({ where: 'new', agent: 'Claude', agentsPending: false })
    ).toBe(true)
    expect(localTaskCreateStartsSession({ where: 'new', agent: null, agentsPending: true })).toBe(
      true
    )
    expect(
      localTaskCreateStartsSession({ where: 'existing', agent: null, agentsPending: false })
    ).toBe(false)
    expect(
      localTaskCreateStartsSession({ where: 'later', agent: 'Claude', agentsPending: false })
    ).toBe(false)
  })

  it('sends the first line, then the task as Start sends it', () => {
    expect(localTaskKickoffPromptText(' Start from the task description ', 'Task SHOP-16: x')).toBe(
      'Start from the task description\n\nTask SHOP-16: x'
    )
    expect(localTaskKickoffPromptText('  ', 'Task SHOP-16: x')).toBe('Task SHOP-16: x')
  })
})
