import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { expect, it, vi } from 'vitest'
import type { LocalTaskProject } from '../../../src/shared/local-tasks/local-task-types'
import { createLocalTasksApi, type LocalTasksApi } from './local-tasks-api'
import { LocalTaskRulesSection } from './local-task-rules-section'

vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: <T,>(styles: T) => styles }
}))
vi.mock('../components/MobileSwitch', () => ({ MobileSwitch: 'MobileSwitch' }))
vi.mock('../components/PickerModal', () => ({ PickerModal: 'PickerModal' }))

const base: LocalTaskProject = {
  id: 'p',
  name: 'Project',
  prefix: 'P',
  aliases: [],
  repos: [],
  defaultRepoId: null,
  lastExecutionHostId: null,
  rules: { startMovesToInProgress: true, prMergedCompletes: false },
  statuses: [],
  createdAt: 0,
  updatedAt: 0,
  revision: 0
}

it('keeps the legacy PR switch when the host did not send prMergedMode', async () => {
  const updateProject = vi.fn().mockResolvedValue({ kind: 'ok', value: { project: base } })
  const api: LocalTasksApi = {
    ...createLocalTasksApi({ sendRequest: async () => ({ id: 'test', ok: true, result: {} }) }),
    updateProject
  }
  let renderer!: ReactTestRenderer
  await act(async () => {
    renderer = create(
      createElement(LocalTaskRulesSection, {
        project: base,
        api,
        readOnly: false,
        onChanged: vi.fn()
      })
    )
  })
  const switchControl = renderer.root
    .findAll((node) => String(node.type) === 'MobileSwitch')
    .find((node) => node.props.testID === 'local-task-rule-prMergedCompletes')
  expect(switchControl).toBeDefined()
  expect(renderer.root.find((node) => String(node.type) === 'PickerModal').props.visible).toBe(
    false
  )
  await act(async () => switchControl?.props.onValueChange(true))
  expect(updateProject.mock.calls[0]?.[0].rules).toEqual({ prMergedCompletes: true })
  act(() => renderer.unmount())
})
