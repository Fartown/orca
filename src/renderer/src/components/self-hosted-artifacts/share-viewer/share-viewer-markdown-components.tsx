import React from 'react'
import type { Components } from 'react-markdown'
import MermaidBlock from '@/components/editor/MermaidBlock'
import { MarkdownGitHubCallout } from '@/components/markdown-github-callout'
import { readGitHubCalloutKind } from '@/lib/remark-github-callouts'
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

const SharePre: NonNullable<Components['pre']> = ({ node: _node, children, ...props }) => {
  const child = React.Children.toArray(children)[0]
  return React.isValidElement(child) && child.type === MermaidBlock ? (
    <>{children}</>
  ) : (
    <pre {...props}>{children}</pre>
  )
}

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
  blockquote: ShareBlockquote
}
