// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BrowserChromeFoldedTool } from '@/components/browser-pane/assemble-chrome/browser-chrome-folded-tools'

vi.mock('@/components/browser-pane/assemble-chrome/use-browser-chrome-tool-fold', () => ({
  BROWSER_CHROME_FOLD_ORDER: ['share'],
  useBrowserChromeToolFold: () => new Set(['share'])
}))

vi.mock('@/components/browser-pane/assemble-chrome/browser-navigation-control-row', () => ({
  BrowserNavigationControlRow: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  )
}))

vi.mock('@/components/browser-pane/annotate/MarkupDrawButton', () => ({
  MarkupDrawButton: () => null
}))

vi.mock('@/components/browser-pane/assemble-chrome/browser-chrome-element-tool-buttons', () => ({
  BrowserChromeElementToolButtons: () => null
}))

import { BrowserChromeToolbar } from '@/components/browser-pane/assemble-chrome/browser-chrome-toolbar'

afterEach(cleanup)

function foldedShareLabel(shareLabel?: string): string | undefined {
  let tools: readonly BrowserChromeFoldedTool[] = []
  render(
    <BrowserChromeToolbar
      controls={{
        canGoBack: false,
        canGoForward: false,
        loading: false,
        goBack: vi.fn(),
        goForward: vi.fn(),
        reload: vi.fn(),
        navigate: vi.fn()
      }}
      addressSlot={null}
      elementTools={null}
      markup={{ active: false, disabled: false, onToggle: vi.fn(), canShowDiscoveryHint: false }}
      shareControl={() => null}
      shareLabel={shareLabel}
      viewSource={null}
      openExternal={null}
      overflowMenu={(overflow) => {
        tools = overflow.tools
        return null
      }}
    />
  )
  return tools.find((tool) => tool.stage === 'share')?.label
}

describe('folded share item label', () => {
  it('names the LAN share when the surface supplies its label', () => {
    expect(foldedShareLabel('Share on local network')).toBe('Share on local network')
  })

  it("keeps upstream's artifact label otherwise", () => {
    expect(foldedShareLabel()).toBe('Share as artifact')
  })
})
