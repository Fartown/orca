/** The phone session's loaded-window facts for the drafts hook; hasMore lets paged-out echoes retire. */
export function mobileNativeChatTranscriptWindow(session: {
  transcriptLoading?: boolean
  status: string
  hasMore?: boolean
}): { transcriptLoading?: boolean; transcriptSettled: boolean; transcriptHasMore?: boolean } {
  return {
    transcriptLoading: session.transcriptLoading,
    transcriptSettled: session.status === 'ready',
    transcriptHasMore: session.hasMore
  }
}
