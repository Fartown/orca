import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Components } from 'react-markdown'
import { MarkdownPreviewBody } from '@/components/editor/MarkdownPreviewBody'
import MermaidBlock from '@/components/editor/MermaidBlock'
import { translate } from '@/i18n/i18n'
import {
  SHARE_ROOT_ELEMENT_ID,
  isShareViewerLocalHref,
  readShareDocument,
  type ShareDocument
} from './viewer-document'
import './viewer.css'

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

// Why module-level: components declared inside ShareViewer get a new identity per render, so
// react-markdown would remount every link and code block whenever the theme flips.
const ShareDarkContext = React.createContext(false)

const ShareLink: NonNullable<Components['a']> = ({ href, children, ...props }) =>
  isShareViewerLocalHref(href) ? (
    <span>{children}</span>
  ) : (
    <a {...props} href={href}>
      {children}
    </a>
  )

const ShareCode: NonNullable<Components['code']> = function ShareCode({
  className,
  children,
  ...props
}) {
  const isDark = React.useContext(ShareDarkContext)
  return /language-mermaid/.test(className || '') ? (
    <MermaidBlock content={String(children).trimEnd()} isDark={isDark} htmlLabels={false} />
  ) : (
    <code className={className} {...props}>
      {children}
    </code>
  )
}

const SharePre: NonNullable<Components['pre']> = ({ children, ...props }) => {
  const child = React.Children.toArray(children)[0]
  return React.isValidElement(child) && child.type === MermaidBlock ? (
    <>{children}</>
  ) : (
    <pre {...props}>{children}</pre>
  )
}

const SHARE_MARKDOWN_COMPONENTS: Components = { a: ShareLink, code: ShareCode, pre: SharePre }

function ShareViewer({ document: shared }: { document: ShareDocument }): React.JSX.Element {
  const isDark = usePrefersDark()
  useEffect(() => {
    window.document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])
  return (
    <div
      className={`orca-share-page markdown-preview ${isDark ? 'markdown-dark' : 'markdown-light'}`}
    >
      <div className="markdown-body" translate="no">
        <ShareDarkContext.Provider value={isDark}>
          <MarkdownPreviewBody content={shared.markdown} components={SHARE_MARKDOWN_COMPONENTS} />
        </ShareDarkContext.Provider>
      </div>
      <footer className="orca-share-footer">
        {translate(
          'auto.components.selfHostedArtifacts.shareViewer.sharedFrom',
          'Shared from Orca on {{computer}}',
          {
            computer: shared.computer
          }
        )}
      </footer>
    </div>
  )
}

const shared = readShareDocument(window.document)
const root = window.document.getElementById(SHARE_ROOT_ELEMENT_ID)
if (shared && root) {
  window.document.title = shared.title
  createRoot(root).render(<ShareViewer document={shared} />)
}
