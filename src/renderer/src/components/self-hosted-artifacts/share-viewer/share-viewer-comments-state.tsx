import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ArtifactShareComment } from '../../../../../shared/self-hosted-artifacts/artifact-share-comments-contract'
import {
  fetchShareComments,
  postShareComment,
  type ShareCommentPostError
} from './share-viewer-comments-client'

const AUTHOR_STORAGE_KEY = 'orca-share-comment-author'

export type ShareCommentRange = { startLine: number; endLine: number }

export type ShareCommentsState = {
  /** False while loading and when the server cannot take comments; blocks then render bare. */
  available: boolean
  comments: ArtifactShareComment[]
  activeBlockKey: string | null
  setActiveBlockKey: (key: string | null) => void
  author: string
  submit: (input: {
    range: ShareCommentRange
    quote?: string
    author: string
    body: string
  }) => Promise<ShareCommentPostError | null>
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

export function shareCommentBlockKey(range: ShareCommentRange): string {
  return `${range.startLine}-${range.endLine}`
}

export function ShareCommentsProvider({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element {
  const [available, setAvailable] = useState(false)
  const [comments, setComments] = useState<ArtifactShareComment[]>([])
  const [activeBlockKey, setActiveBlockKey] = useState<string | null>(null)
  const [author, setAuthor] = useState(readStoredAuthor)

  useEffect(() => {
    let cancelled = false
    void fetchShareComments().then((loaded) => {
      if (!cancelled && loaded) {
        setComments(loaded)
        setAvailable(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const submit = useCallback<ShareCommentsState['submit']>(async (input) => {
    const result = await postShareComment({
      author: input.author,
      body: input.body,
      startLine: input.range.startLine,
      endLine: input.range.endLine,
      ...(input.quote ? { quote: input.quote } : {})
    })
    if ('failure' in result) {
      return result.failure
    }
    storeAuthor(input.author)
    setAuthor(input.author)
    setComments((current) => [...current, result.comment])
    setActiveBlockKey(null)
    return null
  }, [])

  const value = useMemo<ShareCommentsState>(
    () => ({ available, comments, activeBlockKey, setActiveBlockKey, author, submit }),
    [available, comments, activeBlockKey, author, submit]
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
