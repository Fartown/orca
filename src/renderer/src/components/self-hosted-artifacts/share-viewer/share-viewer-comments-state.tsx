import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { ArtifactShareComment } from '../../../../../shared/self-hosted-artifacts/artifact-share-comments-contract'
import {
  deleteShareComment,
  editShareComment,
  fetchShareComments,
  postShareComment,
  type ShareCommentPostError
} from './share-viewer-comments-client'

export type ShareCommentRange = { startLine: number; endLine: number }

/** A comment being written: anchored to source lines, with the reader's exact selection if any. */
export type ShareCommentDraft = { range: ShareCommentRange; quote?: string }

export type ShareCommentsState = {
  /** False while loading and when the server cannot take comments; blocks then render bare. */
  available: boolean
  comments: ArtifactShareComment[]
  draft: ShareCommentDraft | null
  startDraft: (draft: ShareCommentDraft) => void
  cancelDraft: () => void
  /** The comment whose card and text are emphasized, from a hover, focus or click on its text. */
  activeCommentId: string | null
  setActiveCommentId: (id: string | null) => void
  submit: (body: string) => Promise<ShareCommentPostError | null>
  /** A share link carries no identity, so every reader may edit or delete every comment. */
  editComment: (id: string, body: string) => Promise<boolean>
  deleteComment: (id: string) => Promise<boolean>
}

const ShareCommentsContext = React.createContext<ShareCommentsState | null>(null)

/** Like the app's preview, a comment belongs to the block that contains its last line. */
export function isShareCommentInBlock(
  comment: Pick<ArtifactShareComment, 'endLine'>,
  block: ShareCommentRange
): boolean {
  return block.startLine <= comment.endLine && comment.endLine <= block.endLine
}

export function ShareCommentsProvider({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element {
  const [available, setAvailable] = useState(false)
  const [comments, setComments] = useState<ArtifactShareComment[]>([])
  const [draft, setDraft] = useState<ShareCommentDraft | null>(null)
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null)

  // Why on return to the tab: other readers comment meanwhile; the page never polls on its own.
  useEffect(() => {
    let cancelled = false
    const load = (): void => {
      void fetchShareComments().then((loaded) => {
        if (!cancelled && loaded) {
          setComments(loaded)
          setAvailable(true)
        }
      })
    }
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') {
        load()
      }
    }
    load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const cancelDraft = useCallback(() => setDraft(null), [])

  const submit = useCallback<ShareCommentsState['submit']>(
    async (body) => {
      if (!draft) {
        return 'failed'
      }
      const result = await postShareComment({
        body,
        startLine: draft.range.startLine,
        endLine: draft.range.endLine,
        ...(draft.quote ? { quote: draft.quote } : {})
      })
      if ('failure' in result) {
        return result.failure
      }
      setComments((current) => [...current, result.comment])
      setActiveCommentId(result.comment.id)
      setDraft(null)
      return null
    },
    [draft]
  )

  const editComment = useCallback(async (id: string, body: string) => {
    const updated = await editShareComment(id, body)
    if (updated) {
      setComments((current) => current.map((comment) => (comment.id === id ? updated : comment)))
    } else {
      toast.error(
        translate(
          'auto.components.selfHostedArtifacts.shareViewer.commentEditFailed',
          "Couldn't save the change. Check that the link still opens, then try again."
        )
      )
    }
    return updated !== null
  }, [])

  const deleteComment = useCallback(async (id: string) => {
    const result = await deleteShareComment(id)
    if (result === 'failed') {
      toast.error(
        translate(
          'auto.components.selfHostedArtifacts.shareViewer.commentDeleteFailed',
          "Couldn't delete the comment. Check that the link still opens, then try again."
        )
      )
      return false
    }
    setComments((current) => current.filter((comment) => comment.id !== id))
    return true
  }, [])

  const value = useMemo<ShareCommentsState>(
    () => ({
      available,
      comments,
      draft,
      startDraft: setDraft,
      cancelDraft,
      activeCommentId,
      setActiveCommentId,
      submit,
      editComment,
      deleteComment
    }),
    [available, comments, draft, cancelDraft, activeCommentId, submit, editComment, deleteComment]
  )
  return <ShareCommentsContext.Provider value={value}>{children}</ShareCommentsContext.Provider>
}

export function useShareComments(): ShareCommentsState {
  const state = useContext(ShareCommentsContext)
  if (!state) {
    throw new Error('useShareComments must be used inside ShareCommentsProvider')
  }
  return state
}
