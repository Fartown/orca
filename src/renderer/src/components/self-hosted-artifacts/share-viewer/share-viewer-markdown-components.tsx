import React from 'react'
import type { Components } from 'react-markdown'
import MermaidBlock from '@/components/editor/MermaidBlock'
import { MarkdownGitHubCallout } from '@/components/markdown-github-callout'
import { readGitHubCalloutKind } from '@/lib/remark-github-callouts'
import { ShareCommentBlock, ShareCommentListItem } from './ShareCommentBlock'
import { isShareViewerLocalHref } from './viewer-document'

// Why module-level: components declared inside the page get a new identity per render, so
// react-markdown would remount every link and code block whenever the theme flips.
export const ShareDarkContext = React.createContext(false)

const ShareLink: NonNullable<Components['a']> = ({ node: _node, href, children, ...props }) =>
  isShareViewerLocalHref(href) ? (
    <span>{children}</span>
  ) : (
    <a {...props} href={href}>
      {children}
    </a>
  )

const ShareCode: NonNullable<Components['code']> = function ShareCode({
  node: _node,
  className,
  children,
  ...props
}) {
  const isDark = React.useContext(ShareDarkContext)
  return /language-mermaid/.test(className || '') ? (
    <MermaidBlock content={String(children).trimEnd()} isDark={isDark} />
  ) : (
    <code className={className} {...props}>
      {children}
    </code>
  )
}

const SharePre: NonNullable<Components['pre']> = ({ node, children, ...props }) => {
  const child = React.Children.toArray(children)[0]
  return (
    <ShareCommentBlock node={node}>
      {React.isValidElement(child) && child.type === MermaidBlock ? (
        children
      ) : (
        <pre {...props}>{children}</pre>
      )}
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
  li: ShareCommentListItem
}
