import React from 'react'
import type { Components } from 'react-markdown'
import CodeBlockCopyButton from '@/components/editor/CodeBlockCopyButton'
import MermaidBlock from '@/components/editor/MermaidBlock'
import { MARKDOWN_DOC_LINK_PREFIX } from '@/components/editor/markdown-doc-links'
import { useMermaidDiagramExpand } from '@/components/editor/use-mermaid-diagram-expand'
import { MarkdownGitHubCallout } from '@/components/markdown-github-callout'
import { readGitHubCalloutKind } from '@/lib/remark-github-callouts'
import { ShareCommentBlock, ShareCommentListItem } from './ShareCommentBlock'
import { ShareImage } from './ShareImageViewer'
import { isShareViewerLocalHref } from './viewer-document'

// Why module-level: components declared inside the page get a new identity per render, so
// react-markdown would remount every link and code block whenever the theme flips.
export const ShareDarkContext = React.createContext(false)

/** Scrolls the page's own scroller to a heading, footnote or other in-document anchor. */
export const ShareAnchorContext = React.createContext<(anchor: string) => void>(() => {})

const ShareLink: NonNullable<Components['a']> = function ShareLink({
  node: _node,
  href,
  children,
  ...props
}) {
  const navigateToAnchor = React.useContext(ShareAnchorContext)
  // Why: local file links and `[[document]]` links resolve only inside Orca, not on a share link.
  if (isShareViewerLocalHref(href) || href?.startsWith(MARKDOWN_DOC_LINK_PREFIX)) {
    return <span>{children}</span>
  }
  if (href?.startsWith('#')) {
    return (
      <a
        {...props}
        href={href}
        onClick={(event) => {
          event.preventDefault()
          navigateToAnchor(href.slice(1))
        }}
      >
        {children}
      </a>
    )
  }
  // Like the app, a web link opens outside the document; files in this share stay in the tab.
  const external = /^https?:/i.test(href ?? '')
  return (
    <a
      {...props}
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
    </a>
  )
}

const ShareCode: NonNullable<Components['code']> = function ShareCode({
  node: _node,
  className,
  children,
  ...props
}) {
  const isDark = React.useContext(ShareDarkContext)
  const expandDiagram = useMermaidDiagramExpand()
  return /language-mermaid/.test(className || '') ? (
    <MermaidBlock content={String(children).trimEnd()} isDark={isDark} onExpand={expandDiagram} />
  ) : (
    <code className={className} {...props}>
      {children}
    </code>
  )
}

// Same copy button as the app's preview; a diagram keeps its source copy beside the expand button.
const SharePre: NonNullable<Components['pre']> = ({ node, children, ...props }) => {
  const isMermaid = Boolean(
    node?.children.some(
      (child) =>
        child.type === 'element' &&
        child.tagName === 'code' &&
        Array.isArray(child.properties.className) &&
        child.properties.className.some(
          (name) => typeof name === 'string' && name === 'language-mermaid'
        )
    )
  )
  return (
    <ShareCommentBlock node={node}>
      <CodeBlockCopyButton {...props} wrapInPre={!isMermaid}>
        {children}
      </CodeBlockCopyButton>
    </ShareCommentBlock>
  )
}

// Blocks a reader can comment on; each gets the app's annotation rail beside it.
const ShareParagraph: NonNullable<Components['p']> = ({ node, ...props }) => (
  <ShareCommentBlock node={node}>
    <p {...props} />
  </ShareCommentBlock>
)
const ShareH1: NonNullable<Components['h1']> = ({ node, ...props }) => (
  <ShareCommentBlock node={node}>
    <h1 {...props} />
  </ShareCommentBlock>
)
const ShareH2: NonNullable<Components['h2']> = ({ node, ...props }) => (
  <ShareCommentBlock node={node}>
    <h2 {...props} />
  </ShareCommentBlock>
)
const ShareH3: NonNullable<Components['h3']> = ({ node, ...props }) => (
  <ShareCommentBlock node={node}>
    <h3 {...props} />
  </ShareCommentBlock>
)
const ShareH4: NonNullable<Components['h4']> = ({ node, ...props }) => (
  <ShareCommentBlock node={node}>
    <h4 {...props} />
  </ShareCommentBlock>
)
const ShareH5: NonNullable<Components['h5']> = ({ node, ...props }) => (
  <ShareCommentBlock node={node}>
    <h5 {...props} />
  </ShareCommentBlock>
)
const ShareH6: NonNullable<Components['h6']> = ({ node, ...props }) => (
  <ShareCommentBlock node={node}>
    <h6 {...props} />
  </ShareCommentBlock>
)
const ShareTable: NonNullable<Components['table']> = ({ node, ...props }) => (
  <ShareCommentBlock node={node}>
    <table {...props} />
  </ShareCommentBlock>
)

const ShareBlockquote: NonNullable<Components['blockquote']> = ({ node, children, ...props }) => {
  const calloutKind = readGitHubCalloutKind(node?.properties.dataCallout)
  return calloutKind ? (
    <MarkdownGitHubCallout kind={calloutKind}>{children}</MarkdownGitHubCallout>
  ) : (
    <blockquote {...props}>{children}</blockquote>
  )
}

export const SHARE_MARKDOWN_COMPONENTS: Components = {
  a: ShareLink,
  code: ShareCode,
  pre: SharePre,
  blockquote: ShareBlockquote,
  p: ShareParagraph,
  h1: ShareH1,
  h2: ShareH2,
  h3: ShareH3,
  h4: ShareH4,
  h5: ShareH5,
  h6: ShareH6,
  table: ShareTable,
  img: ({ node: _node, ...props }) => <ShareImage {...props} />,
  li: ShareCommentListItem
}
