import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type {
  ArtifactShareComment,
  ArtifactShareCommentAnchor
} from '../../../../../shared/self-hosted-artifacts/artifact-share-comments-contract'
import {
  deleteShareComment,
  editShareComment,
  fetchShareComments,
  postShareComment,
  type ShareCommentPostError
} from './share-viewer-comments-client'

export type ShareCommentRange = { startLine: number; endLine: number }

/** A comment being written: its source lines, the text it is about, and where that text sits. */
export type ShareCommentDraft = {
  range: ShareCommentRange
  quote?: string
  anchor?: ArtifactShareCommentAnchor
}

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
  /** Briefly flashed card and text, so the eye finds which pair a click connected. */
  attentionCommentId: string | null
  flashComment: (id: string) => void
  submit: (body: string) => Promise<ShareCommentPostError | null>
  /** A share link carries no identity, so every reader may edit or delete every comment. */
  editComment: (id: string, body: string) => Promise<boolean>
  deleteComment: (id: string) => Promise<boolean>
}

const ShareCommentsContext = React.createContext<ShareCommentsState | null>(null)

// Matches the app's review-note attention animation.
const ATTENTION_MS = 900

export function ShareCommentsProvider({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element {
  const [available, setAvailable] = useState(false)
  const [comments, setComments] = useState<ArtifactShareComment[]>([])
  const [draft, setDraft] = useState<ShareCommentDraft | null>(null)
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null)
  const [attentionCommentId, setAttentionCommentId] = useState<string | null>(null)
  const attentionTimer = useRef(0)
  const flashComment = useCallback((id: string) => {
    window.clearTimeout(attentionTimer.current)
    // Why null first: flashing the same comment twice must restart its animation.
    setAttentionCommentId(null)
    requestAnimationFrame(() => setAttentionCommentId(id))
    attentionTimer.current = window.setTimeout(() => setAttentionCommentId(null), ATTENTION_MS)
  }, [])
  useEffect(() => () => window.clearTimeout(attentionTimer.current), [])

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
        ...(draft.quote ? { quote: draft.quote } : {}),
        ...(draft.anchor ? { anchor: draft.anchor } : {})
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
      attentionCommentId,
      flashComment,
      submit,
      editComment,
      deleteComment
    }),
    [
      available,
      comments,
      draft,
      cancelDraft,
      activeCommentId,
      attentionCommentId,
      flashComment,
      submit,
      editComment,
      deleteComment
    ]
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
