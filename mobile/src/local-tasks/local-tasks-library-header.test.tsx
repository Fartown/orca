import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import { localTasksCopy } from './local-tasks-copy'
import { LocalTasksLibraryHeader } from './local-tasks-library-header'

vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 }
}))
vi.mock('lucide-react-native', () => ({
  ChevronDown: 'ChevronDown',
  ChevronLeft: 'ChevronLeft',
  Columns3: 'Columns3',
  Layers: 'Layers',
  List: 'List',
  Plus: 'Plus',
  Search: 'Search',
  Server: 'Server',
  Settings: 'Settings'
}))
vi.mock('../components/ActionSheetModal', () => ({ ActionSheetModal: 'ActionSheetModal' }))

let renderer: ReactTestRenderer | null = null
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

it('reaches another host from an empty library, where no project can be picked', () => {
  const onPickHost = vi.fn()
  act(() => {
    renderer = create(
      createElement(LocalTasksLibraryHeader, {
        projects: [],
        projectId: null,
        onSelectProject: vi.fn(),
        hostLabel: 'minizc',
        onPickHost,
        view: 'list',
        showViewToggle: false,
        searchActive: false,
        onExit: vi.fn(),
        onSettings: vi.fn(),
        onView: vi.fn()
      })
    )
  })
  const scope = renderer!.root.findByProps({ testID: 'local-tasks-scope' })
  expect(scope.props.disabled).toBe(false)
  act(() => scope.props.onPress())
  const sheet = renderer!.root.find((node) => Array.isArray(node.props.actions))
  const actions: { label: string }[] = sheet.props.actions
  const labels = actions.map((action) => action.label)
  const copy = localTasksCopy()
  expect(labels).toContain(copy.switchHost)
  expect(labels).not.toContain(copy.allProjects)
})
