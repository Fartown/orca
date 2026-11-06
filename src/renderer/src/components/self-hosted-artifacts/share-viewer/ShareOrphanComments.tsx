import React, { useLayoutEffect, useState, type RefObject } from 'react'
import { translate } from '@/i18n/i18n'
import { ShareCommentCard, ShareCommentCardFrame } from './ShareCommentBlock'
import { findShareCommentHomeBlock } from './share-comment-blocks'
import { useShareComments } from './share-viewer-comments-state'

/** Comments whose last line no longer falls in a block (the file changed after they were left). */
export function ShareOrphanComments({
  bodyRef,
  markdown
}: {
  bodyRef: RefObject<HTMLDivElement | null>
  markdown: string
}): React.JSX.Element | null {
  const { available, comments } = useShareComments()
  const [orphanIds, setOrphanIds] = useState<ReadonlySet<string>>(() => new Set())

  useLayoutEffect(() => {
    const body = bodyRef.current
    setOrphanIds(
      new Set(
        body
          ? comments
              .filter((comment) => findShareCommentHomeBlock(body, comment) === null)
              .map((comment) => comment.id)
          : []
      )
    )
  }, [bodyRef, comments, markdown])

  const orphans = comments.filter((comment) => orphanIds.has(comment.id))
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
          <ShareCommentCardFrame
            key={comment.id}
            comment={comment}
            className="markdown-annotation-card"
          >
            <ShareCommentCard comment={comment} />
          </ShareCommentCardFrame>
        ))}
      </div>
    </section>
  )
}
