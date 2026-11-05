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

const AUTHOR_STORAGE_KEY = 'orca-share-comment-author'
const TOKENS_STORAGE_KEY = 'orca-share-comment-tokens'

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
  author: string
  submit: (input: { author: string; body: string }) => Promise<ShareCommentPostError | null>
  /** True for comments this browser wrote: only their author can edit or delete them. */
  isOwnComment: (id: string) => boolean
  editComment: (id: string, body: string) => Promise<boolean>
  deleteComment: (id: string) => Promise<boolean>
}

const ShareCommentsContext = React.createContext<ShareCommentsState | null>(null)

// Why try/catch: storage can throw in private windows; the name is only a convenience.
function readStoredAuthor(): string {
  try {
    return window.localStorage.getItem(AUTHOR_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function storeAuthor(author: string): void {
  try {
    window.localStorage.setItem(AUTHOR_STORAGE_KEY, author)
  } catch {
    // Without storage the reader types their name again next time.
  }
}

// Why kept in this browser: the token is the only proof of authorship a share link has.
function readStoredTokens(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(TOKENS_STORAGE_KEY) ?? '{}')
    return parsed !== null && typeof parsed === 'object' ? { ...parsed } : {}
  } catch {
    return {}
  }
}

function storeTokens(tokens: Record<string, string>): void {
  try {
    window.localStorage.setItem(TOKENS_STORAGE_KEY, JSON.stringify(tokens))
  } catch {
    // Without storage, the reader can still change comments until the page is closed.
  }
}

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
  const [author, setAuthor] = useState(readStoredAuthor)
  const [tokens, setTokens] = useState(readStoredTokens)
  useEffect(() => storeTokens(tokens), [tokens])

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
    async (input) => {
      if (!draft) {
        return 'failed'
      }
      const result = await postShareComment({
        ...(input.author ? { author: input.author } : {}),
        body: input.body,
        startLine: draft.range.startLine,
        endLine: draft.range.endLine,
        ...(draft.quote ? { quote: draft.quote } : {})
      })
      if ('failure' in result) {
        return result.failure
      }
      storeAuthor(input.author)
      setAuthor(input.author)
      setTokens((current) => ({ ...current, [result.comment.id]: result.editToken }))
      setComments((current) => [...current, result.comment])
      setActiveCommentId(result.comment.id)
      setDraft(null)
      return null
    },
    [draft]
  )

  const isOwnComment = useCallback((id: string) => typeof tokens[id] === 'string', [tokens])

  const editComment = useCallback(
    async (id: string, body: string) => {
      const token = tokens[id]
      const updated = token ? await editShareComment(id, token, body) : null
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
    },
    [tokens]
  )

  const deleteComment = useCallback(
    async (id: string) => {
      const token = tokens[id]
      const result = token ? await deleteShareComment(id, token) : 'failed'
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
      setTokens((current) => {
        const { [id]: _removed, ...next } = current
        return next
      })
      return true
    },
    [tokens]
  )

  const value = useMemo<ShareCommentsState>(
    () => ({
      available,
      comments,
      draft,
      startDraft: setDraft,
      cancelDraft,
      activeCommentId,
      setActiveCommentId,
      author,
      submit,
      isOwnComment,
      editComment,
      deleteComment
    }),
    [
      available,
      comments,
      draft,
      cancelDraft,
      activeCommentId,
      author,
      submit,
      isOwnComment,
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
