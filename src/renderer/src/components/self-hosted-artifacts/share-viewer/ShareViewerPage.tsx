import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MarkdownPreviewBody } from '@/components/editor/MarkdownPreviewBody'
import { MarkdownTableOfContentsPanel } from '@/components/editor/MarkdownTableOfContentsPanel'
import { scrollToAnchorInEditor } from '@/components/editor/markdown-anchor-scroll'
import { buildMarkdownTableOfContents } from '@/components/editor/markdown-table-of-contents'
import { ShareOrphanComments } from './ShareOrphanComments'
import { ShareViewerHeader } from './ShareViewerHeader'
import { ShareCommentsProvider, useShareComments } from './share-viewer-comments-state'
import { SHARE_MARKDOWN_COMPONENTS, ShareDarkContext } from './share-viewer-markdown-components'
import type { ShareDocument } from './viewer-document'

// Matches the markdown-preview.css container query that turns the TOC panel into an overlay.
const TOC_OVERLAY_MAX_SHELL_WIDTH = 560
const TOC_OPEN_BY_DEFAULT_QUERY = '(min-width: 768px)'

function usePrefersDark(): boolean {
  const query = useMemo(() => window.matchMedia('(prefers-color-scheme: dark)'), [])
  const [dark, setDark] = useState(query.matches)
  useEffect(() => {
    const onChange = (event: MediaQueryListEvent): void => setDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [query])
  return dark
}

function readLocationAnchor(): string {
  return window.location.hash.slice(1)
}

export function ShareViewerPage({
  document: shared
}: {
  document: ShareDocument
}): React.JSX.Element {
  return (
    <ShareCommentsProvider>
      <ShareViewerLayout document={shared} />
    </ShareCommentsProvider>
  )
}

function ShareViewerLayout({ document: shared }: { document: ShareDocument }): React.JSX.Element {
  const { available: commentsAvailable } = useShareComments()
  const isDark = usePrefersDark()
  const tableOfContents = useMemo(
    () => buildMarkdownTableOfContents(shared.markdown),
    [shared.markdown]
  )
  const [tableOfContentsOpen, setTableOfContentsOpen] = useState(
    () => tableOfContents.length > 0 && window.matchMedia(TOC_OPEN_BY_DEFAULT_QUERY).matches
  )
  const shellRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  // Why: the browser's own fragment scroll runs before React renders the headings.
  useEffect(() => {
    const anchor = readLocationAnchor()
    if (anchor) {
      scrollToAnchorInEditor(bodyRef.current, anchor)
    }
  }, [])

  const navigateToHeading = useCallback((id: string): void => {
    scrollToAnchorInEditor(bodyRef.current, id)
    window.history.replaceState(null, '', `#${encodeURIComponent(id)}`)
    if ((shellRef.current?.clientWidth ?? 0) <= TOC_OVERLAY_MAX_SHELL_WIDTH) {
      setTableOfContentsOpen(false)
    }
  }, [])

  return (
    <div className="flex h-dvh flex-col">
      <ShareViewerHeader
        document={shared}
        tableOfContentsOpen={tableOfContentsOpen}
        onToggleTableOfContents={() => setTableOfContentsOpen((open) => !open)}
      />
      <div ref={shellRef} className="markdown-preview-shell min-h-0 flex-1">
        {tableOfContentsOpen ? (
          <MarkdownTableOfContentsPanel
            items={tableOfContents}
            onClose={() => setTableOfContentsOpen(false)}
            onNavigate={navigateToHeading}
          />
        ) : null}
        <div
          tabIndex={0}
          className={`markdown-preview h-full min-h-0 overflow-auto scrollbar-editor ${isDark ? 'markdown-dark' : 'markdown-light'}`}
        >
          {/* Why: OS page translation can replace react-owned text nodes and crash reconciliation. */}
          <div
            ref={bodyRef}
            className={`markdown-body orca-share-body ${commentsAvailable ? 'orca-share-body-with-comments' : ''}`.trim()}
            translate="no"
          >
            <ShareDarkContext.Provider value={isDark}>
              <MarkdownPreviewBody
                content={shared.markdown}
                components={SHARE_MARKDOWN_COMPONENTS}
              />
            </ShareDarkContext.Provider>
            <ShareOrphanComments bodyRef={bodyRef} markdown={shared.markdown} />
          </div>
        </div>
      </div>
    </div>
  )
}
