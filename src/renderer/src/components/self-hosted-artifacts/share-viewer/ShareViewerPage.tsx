import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Toaster } from 'sonner'
import DiagramViewerModal from '@/components/editor/DiagramViewerModal'
import { MarkdownPreviewBody } from '@/components/editor/MarkdownPreviewBody'
import { MarkdownTableOfContentsPanel } from '@/components/editor/MarkdownTableOfContentsPanel'
import { scrollToAnchorInEditor } from '@/components/editor/markdown-anchor-scroll'
import {
  decodeMarkdownPreviewAnchor,
  getMarkdownPreviewAnchorScrollTop
} from '@/components/editor/markdown-preview-anchor-navigation'
import { revealMarkdownNavigationDetails } from '@/components/editor/markdown-navigation-details'
import { buildMarkdownTableOfContents } from '@/components/editor/markdown-table-of-contents'
import { exceedsMarkdownRichModeSizeLimit } from '@/components/editor/markdown-rich-size-limit'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { ShareCommentInlineContext } from './ShareCommentBlock'
import { ShareCommentHighlights, ShareSelectionCommentButton } from './ShareCommentHighlights'
import { ShareCommentRail } from './ShareCommentRail'
import { ShareImageViewerProvider } from './ShareImageViewer'
import { ShareOrphanComments } from './ShareOrphanComments'
import { ShareViewerHeader } from './ShareViewerHeader'
import { ShareCommentsProvider, useShareComments } from './share-viewer-comments-state'
import {
  SHARE_MARKDOWN_COMPONENTS,
  ShareAnchorContext,
  ShareDarkContext
} from './share-viewer-markdown-components'
import type { ShareDocument } from './viewer-document'

// Matches the markdown-preview.css container query that turns the TOC panel into an overlay.
const TOC_OVERLAY_MAX_SHELL_WIDTH = 560
const TOC_OPEN_BY_DEFAULT_QUERY = '(min-width: 768px)'
// A large document's TOC is parsed after first paint; this guesses whether it will have entries.
const HEADING_LINE = /^ {0,3}#{1,5}[ \t]/m
// Matches the markdown-preview.css container query below which the app's notes stop using a rail.
const COMMENT_RAIL_MIN_WIDTH = 760

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

/** Below the rail width, cards follow their block instead of sitting beside the text. */
function useNarrow(ref: React.RefObject<HTMLElement | null>, minWidth: number): boolean {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!element) {
      return
    }
    const observer = new ResizeObserver(() => setNarrow(element.clientWidth < minWidth))
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, minWidth])
  return narrow
}

/**
 * Past the app's rich-preview size the render blocks for seconds; paint a status first so the
 * reader sees the page working instead of a blank tab.
 */
function useDeferredLargeRender(markdown: string): boolean {
  const [ready, setReady] = useState(() => !exceedsMarkdownRichModeSizeLimit(markdown))
  useEffect(() => {
    if (ready) {
      return
    }
    let timer = 0
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => setReady(true), 0)
    })
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [ready])
  return ready
}

function readLocationAnchor(): string {
  return window.location.hash.slice(1)
}

// Why the prefix: sanitizing clobbers footnote ids a second time, so `#user-content-fn-1` lands on
// `user-content-user-content-fn-1`.
const SANITIZED_ID_PREFIX = 'user-content-'

/** Same landing as the app's preview anchors; headings also resolve by slug, as in its TOC. */
function scrollToShareAnchor(
  scroller: HTMLElement | null,
  body: HTMLElement | null,
  raw: string
): void {
  if (!scroller || !body || !raw) {
    return
  }
  const anchor = decodeMarkdownPreviewAnchor(raw)
  const target = [...body.querySelectorAll<HTMLElement>('[id]')].find(
    (element) => element.id === anchor || element.id === `${SANITIZED_ID_PREFIX}${anchor}`
  )
  if (!target) {
    scrollToAnchorInEditor(body, raw)
    return
  }
  revealMarkdownNavigationDetails(target)
  scroller.scrollTo({ top: getMarkdownPreviewAnchorScrollTop(scroller, target) })
}

export function ShareViewerPage({
  document: shared
}: {
  document: ShareDocument
}): React.JSX.Element {
  const isDark = usePrefersDark()
  const diagramOpen = useAppStore((state) => state.activeModal === 'diagram-viewer')
  return (
    <ShareCommentsProvider>
      <ShareImageViewerProvider>
        <ShareViewerLayout document={shared} isDark={isDark} />
      </ShareImageViewerProvider>
      {/* Same diagram viewer the app opens from its Markdown preview. */}
      {diagramOpen ? <DiagramViewerModal /> : null}
      <Toaster theme={isDark ? 'dark' : 'light'} position="bottom-center" />
    </ShareCommentsProvider>
  )
}

function ShareViewerLayout({
  document: shared,
  isDark
}: {
  document: ShareDocument
  isDark: boolean
}): React.JSX.Element {
  const { available: commentsAvailable, comments, draft } = useShareComments()
  const bodyReady = useDeferredLargeRender(shared.markdown)
  // Why deferred with the body: parsing a large document's headings also blocks for seconds.
  const tableOfContents = useMemo(
    () => (bodyReady ? buildMarkdownTableOfContents(shared.markdown) : []),
    [bodyReady, shared.markdown]
  )
  const [tableOfContentsOpen, setTableOfContentsOpen] = useState(
    () =>
      (bodyReady ? tableOfContents.length > 0 : HEADING_LINE.test(shared.markdown)) &&
      window.matchMedia(TOC_OPEN_BY_DEFAULT_QUERY).matches
  )
  const shellRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const inlineComments = useNarrow(scrollRef, COMMENT_RAIL_MIN_WIDTH)
  const showRail = commentsAvailable && !inlineComments && (comments.length > 0 || draft !== null)

  useEffect(() => {
    window.document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  // Why: the browser's own fragment scroll runs before React renders the headings.
  useEffect(() => {
    if (bodyReady) {
      scrollToShareAnchor(scrollRef.current, bodyRef.current, readLocationAnchor())
    }
  }, [bodyReady])

  const navigateToAnchor = useCallback((anchor: string): void => {
    scrollToShareAnchor(scrollRef.current, bodyRef.current, anchor)
    window.history.replaceState(null, '', `#${anchor}`)
  }, [])

  const navigateToHeading = useCallback((id: string): void => {
    scrollToShareAnchor(scrollRef.current, bodyRef.current, id)
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
        {tableOfContentsOpen && bodyReady ? (
          <MarkdownTableOfContentsPanel
            items={tableOfContents}
            onClose={() => setTableOfContentsOpen(false)}
            onNavigate={navigateToHeading}
          />
        ) : null}
        <div
          ref={scrollRef}
          tabIndex={0}
          className={`markdown-preview h-full min-h-0 overflow-auto scrollbar-editor ${isDark ? 'markdown-dark' : 'markdown-light'}`}
        >
          {/* Why: OS page translation can replace react-owned text nodes and crash reconciliation. */}
          <div
            ref={bodyRef}
            className={`markdown-body orca-share-body ${showRail ? 'orca-share-body-with-rail' : ''}`.trim()}
            translate="no"
          >
            <ShareDarkContext.Provider value={isDark}>
              <ShareAnchorContext.Provider value={navigateToAnchor}>
                <ShareCommentInlineContext.Provider value={inlineComments}>
                  {bodyReady ? (
                    <MarkdownPreviewBody
                      content={shared.markdown}
                      components={SHARE_MARKDOWN_COMPONENTS}
                    />
                  ) : (
                    <p
                      role="status"
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                      <Loader2 className="size-4 animate-spin" />
                      {translate('editor.markdownPreview.preparing', 'Preparing preview…')}
                    </p>
                  )}
                </ShareCommentInlineContext.Provider>
              </ShareAnchorContext.Provider>
            </ShareDarkContext.Provider>
            {bodyReady ? (
              <>
                <ShareOrphanComments bodyRef={bodyRef} markdown={shared.markdown} />
                <ShareCommentHighlights bodyRef={bodyRef} markdown={shared.markdown} />
                {showRail ? <ShareCommentRail bodyRef={bodyRef} /> : null}
              </>
            ) : null}
          </div>
        </div>
      </div>
      <ShareSelectionCommentButton bodyRef={bodyRef} scrollRef={scrollRef} />
    </div>
  )
}
