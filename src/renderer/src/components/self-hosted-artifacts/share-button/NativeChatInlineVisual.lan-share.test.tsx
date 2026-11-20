// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

const target = { kind: 'environment' as const, environmentId: 'env-1' }
const PATH = '/home/host/.config/orca/chat-scratch/usage.html'

vi.mock('@/components/native-chat/media/visuals/use-native-chat-visual-document', () => ({
  useNativeChatVisualDocument: () => ({
    status: 'ready',
    document: { path: PATH, html: '<p>v1</p>', revision: 'r1' }
  })
}))

vi.mock('@/components/native-chat/media/visuals/NativeChatVisualFrame', () => ({
  NATIVE_CHAT_VISUAL_RESERVED_HEIGHT: 120,
  NativeChatVisualFrame: () => null
}))

vi.mock('@/components/native-chat/media/images/native-chat-image-visibility', () => ({
  observeTranscriptVisibility: (_element: Element, onVisible: (visible: boolean) => void) => {
    onVisible(true)
    return () => {}
  }
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: () => null
}))

vi.mock('@/components/artifacts/ArtifactPublishButton', () => ({
  ArtifactPublishButton: () => <button data-artifact-publish />
}))

vi.mock('@/components/self-hosted-artifacts/share-button/LanArtifactShareEntryButtons', () => ({
  NativeChatVisualLanShareButton: ({
    owner,
    filePath
  }: {
    owner: { target: unknown }
    filePath: string
  }) => (
    <button
      aria-label="Share on local network"
      data-target={JSON.stringify(owner.target)}
      data-path={filePath}
    />
  )
}))

import { NativeChatInlineVisual } from '@/components/native-chat/media/visuals/NativeChatInlineVisual'

afterEach(cleanup)

it("shares a chat visual from the chat's own host on the local network, never through the cloud", () => {
  const { container } = render(
    <NativeChatInlineVisual
      owner={{ target, sessionId: 'session-1', worktreeId: 'wt-1' }}
      file="usage.html"
      title="Usage"
    />
  )

  const share = screen.getByRole('button', { name: 'Share on local network' })
  expect(share.getAttribute('data-path')).toBe(PATH)
  expect(JSON.parse(share.getAttribute('data-target') ?? 'null')).toEqual(target)
  expect(container.querySelector('[data-artifact-publish]')).toBeNull()
})
