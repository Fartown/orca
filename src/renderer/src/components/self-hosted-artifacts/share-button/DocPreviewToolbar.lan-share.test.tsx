import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { DocPreviewGrantLocation } from '@/lib/browser/documents/doc-preview-grants'
import type { DocPreviewDocumentIdentity } from '@/components/browser-pane/workspace-doc/doc-preview-document-identity'

vi.mock('@/components/browser-pane/assemble-chrome/toolbar/browser-chrome-toolbar', () => ({
  BrowserChromeToolbar: ({ shareControl }: { shareControl?: React.ReactNode }) => (
    <div>{shareControl}</div>
  )
}))

vi.mock('@/components/browser-pane/assemble-chrome/toolbar/browser-reload-control', () => ({
  BrowserReloadControl: () => null
}))

vi.mock('@/components/browser-pane/workspace-doc/doc-preview-address-edit', () => ({
  DocPreviewAddressEdit: () => null
}))

vi.mock('@/components/browser-pane/workspace-doc/doc-preview-overflow-menu', () => ({
  DocPreviewOverflowMenu: () => null
}))

vi.mock('@/i18n/use-translate', () => ({
  useTranslate: () => (_key: string, fallback: string) => fallback
}))

vi.mock('@/components/self-hosted-artifacts/share-button/LanArtifactShareEntryButtons', () => ({
  docPreviewLanShareControl: (_identity: unknown, location: unknown) =>
    location ? <button data-lan-share /> : undefined
}))

import { DocPreviewToolbar } from '@/components/browser-pane/workspace-doc/doc-preview-toolbar'

const identity = { absolutePath: '/repo/report.html' } as DocPreviewDocumentIdentity
const location = { owner: { kind: 'local' } } as unknown as DocPreviewGrantLocation

function renderToolbar(shareLocation: DocPreviewGrantLocation | null): string {
  return renderToStaticMarkup(
    <DocPreviewToolbar
      identity={identity}
      previewId="page-1"
      worktreeId="wt-1"
      history={{
        canGoBack: false,
        canGoForward: false,
        goBack: vi.fn(),
        goForward: vi.fn(),
        sync: vi.fn(),
        reset: vi.fn()
      }}
      onReload={vi.fn()}
      onHardReload={vi.fn()}
      onCopyPath={vi.fn()}
      onCopyRelativePath={vi.fn()}
      onOpenSource={vi.fn()}
      onOpenExternally={vi.fn()}
      elementTools={{} as never}
      markupActive={false}
      onToggleMarkup={vi.fn()}
      markupDisabled={false}
      shareLocation={shareLocation}
      shareControl={<button data-artifact-publish />}
    />
  )
}

describe('DocPreviewToolbar share entry', () => {
  it("shares on the local network from the preview grant's owner instead of publishing", () => {
    const html = renderToolbar(location)
    expect(html).toContain('data-lan-share')
    expect(html).not.toContain('data-artifact-publish')
  })

  it('keeps the caller share control when the preview has no grant location', () => {
    expect(renderToolbar(null)).not.toContain('data-lan-share')
  })
})
