import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({ View: 'View' }))
vi.mock('../components/controls/MobileSegmentedControl', () => ({ MobileSegmentedControl: 'X' }))
vi.mock('../components/code-presentation/MobileSourceCopyButton', () => ({
  MobileSourceCopyButton: 'X'
}))
vi.mock('../i18n/use-mobile-translation', () => ({ useMobileTranslation: () => () => '' }))
vi.mock('../theme/use-mobile-color-scheme', () => ({ useMobileColorScheme: () => 'light' }))
vi.mock('../files/preview/mobile-file-preview-styles', () => ({ filePreviewStyles: {} }))

const { useMarkdownPreviewMode } = await import('../files/markdown/MobileMarkdownPreviewModeBar')

const seen: string[] = []
let pick: ((mode: 'preview' | 'source') => void) | null = null

function Preview({ path, line }: { path: string; line?: number }) {
  const [mode, setMode] = useMarkdownPreviewMode(path, line)
  seen.push(mode)
  pick = setMode
  return null
}

describe('a Markdown file opened from a line-numbered link on the phone', () => {
  let renderer: ReactTestRenderer | null = null
  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
    seen.length = 0
  })

  it('starts in the reader', () => {
    act(() => {
      renderer = create(createElement(Preview, { path: 'docs/guide.md', line: 20 }))
    })
    expect(seen.at(-1)).toBe('preview')
  })

  it('returns to the reader when another line link replaces a manual Source pick', () => {
    act(() => {
      renderer = create(createElement(Preview, { path: 'docs/guide.md', line: 20 }))
    })
    act(() => pick?.('source'))
    expect(seen.at(-1)).toBe('source')
    act(() => renderer?.update(createElement(Preview, { path: 'docs/guide.md', line: 40 })))
    expect(seen.at(-1)).toBe('preview')
  })
})
