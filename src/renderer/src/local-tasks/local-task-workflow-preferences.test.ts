import { beforeEach, describe, expect, it } from 'vitest'
import type { LocalTask } from '../../../shared/local-tasks/local-task-types'
import { toClientLocalTask } from './local-task-client-rows'
import { localTasksDomainStore } from './local-tasks-domain-store'
import { localTaskWorkflowPreferences } from './local-task-workflow-preferences'

const REMOTE = 'runtime:env-1'
const localId = 'task-1'
const remoteId = `${REMOTE}/${localId}`

beforeEach(() => {
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState())
  localTasksDomainStore.getState().openEndpoint('local')
  localTasksDomainStore.getState().openEndpoint(REMOTE)
})

describe('task workflow preferences', () => {
  it('defaults to a brief and immediate send for both libraries', () => {
    expect(localTaskWorkflowPreferences(localId)).toEqual({ brief: true, delivery: 'auto-submit' })
    expect(localTaskWorkflowPreferences(remoteId)).toEqual({ brief: true, delivery: 'auto-submit' })
  })

  it('keeps each library preference and progress session identity separate', () => {
    localTasksDomainStore
      .getState()
      .writer(REMOTE)
      .applyPreferences({ taskBrief: '0', sessionSend: 'draft' })
    expect(localTaskWorkflowPreferences(remoteId)).toEqual({ brief: false, delivery: 'draft' })
    expect(localTaskWorkflowPreferences(localId)).toEqual({ brief: true, delivery: 'auto-submit' })
    const task: LocalTask = {
      id: localId,
      projectId: 'p',
      number: 1,
      ref: 'P-1',
      title: 'One',
      description: '',
      criteria: [],
      statusId: 's',
      priority: 0,
      labels: [],
      parentId: null,
      createdAt: 1,
      updatedAt: 1,
      revision: 1,
      latestProgress: { kind: 'turn-ended', body: 'Finished', at: 2, sessionLinkId: 'session-1' }
    }
    expect(toClientLocalTask(REMOTE, task).latestProgress?.sessionLinkId).toBe(
      `${REMOTE}/session-1`
    )
    expect(toClientLocalTask('local', task).latestProgress?.sessionLinkId).toBe('session-1')
  })

  it('uses status fallback on a library without preferences, then honors explicit values', () => {
    const writer = localTasksDomainStore.getState().writer(REMOTE)
    writer.applyStatus({
      taskHost: true,
      state: 'ready',
      reason: null,
      revision: 1,
      taskHostId: 'host',
      taskBrief: false,
      sessionSend: 'draft'
    })
    expect(localTaskWorkflowPreferences(remoteId)).toEqual({ brief: false, delivery: 'draft' })
    writer.applyPreferences({ taskBrief: '1', sessionSend: 'submit' })
    expect(localTaskWorkflowPreferences(remoteId)).toEqual({ brief: true, delivery: 'auto-submit' })
  })
})
