import React, { useLayoutEffect, useState, type RefObject } from 'react'
import { translate } from '@/i18n/i18n'
import { ShareCommentCard } from './ShareCommentBlock'
import { shareCommentBlockKey, useShareComments } from './share-viewer-comments-state'

/** Comments whose lines no longer start and end a block (the file changed after they were left). */
export function ShareOrphanComments({
  bodyRef,
  markdown
}: {
  bodyRef: RefObject<HTMLDivElement | null>
  markdown: string
}): React.JSX.Element | null {
  const { available, comments } = useShareComments()
  const [renderedKeys, setRenderedKeys] = useState<ReadonlySet<string> | null>(null)

  useLayoutEffect(() => {
    const blocks = bodyRef.current?.querySelectorAll<HTMLElement>('[data-share-comment-block]')
    setRenderedKeys(new Set([...(blocks ?? [])].map((block) => block.dataset.shareCommentBlock ?? '')))
  }, [available, bodyRef, comments, markdown])

  const orphans = renderedKeys
    ? comments.filter((comment) => !renderedKeys.has(shareCommentBlockKey(comment)))
    : []
  if (!available || orphans.length === 0) {
    return null
  }
  return (
    <section className="orca-share-orphan-comments">
      <h2 className="text-sm font-semibold">
        {translate(
          'auto.components.selfHostedArtifacts.shareViewer.orphanComments',
          'Comments on an earlier version'
        )}
      </h2>
      <div className="markdown-annotation-note-stack">
        {orphans.map((comment) => (
          <ShareCommentCard key={comment.id} comment={comment} />
        ))}
      </div>
    </section>
  )
}
