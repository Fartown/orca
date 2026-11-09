import React from 'react'
import { translate } from '@/i18n/i18n'
import { ShareCommentCard, ShareCommentCardFrame } from './ShareCommentBlock'
import { useShareCommentPlacements } from './ShareCommentPlacements'
import { useShareComments } from './share-viewer-comments-state'

/** Comments whose text is no longer in the file: listed after it, with the text they quoted. */
export function ShareOrphanComments(): React.JSX.Element | null {
  const { available, comments } = useShareComments()
  const placements = useShareCommentPlacements()
  const orphans = comments.filter((comment) => placements.get(comment.id)?.kind === 'orphan')
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
