import React, { useCallback, useContext, useMemo, useState } from 'react'
import { PanZoomImageDialog } from '@/components/editor/PanZoomImageDialog'
import { translate } from '@/i18n/i18n'

type ShareImageViewerState = { open: (src: string, title: string) => void }

const ShareImageViewerContext = React.createContext<ShareImageViewerState>({ open: () => {} })

/** One pan and zoom viewer for the page's images: the same dialog Orca opens for an image file. */
export function ShareImageViewerProvider({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element {
  const [image, setImage] = useState<{ src: string; title: string } | null>(null)
  const open = useCallback((src: string, title: string) => setImage({ src, title }), [])
  const value = useMemo(() => ({ open }), [open])
  return (
    <ShareImageViewerContext.Provider value={value}>
      {children}
      {image ? (
        <PanZoomImageDialog
          open
          onOpenChange={(next) => !next && setImage(null)}
          src={image.src}
          title={image.title}
          showTitle
        />
      ) : null}
    </ShareImageViewerContext.Provider>
  )
}

export function ShareImage({ src, alt, ...props }: React.ComponentProps<'img'>): React.JSX.Element {
  const viewer = useContext(ShareImageViewerContext)
  const title =
    alt || translate('auto.components.selfHostedArtifacts.shareViewer.imageTitle', 'Image')
  return (
    <img
      {...props}
      src={src}
      alt={alt ?? ''}
      className={`${props.className ?? ''} cursor-zoom-in`.trim()}
      onClick={(event) => {
        // Why: an image inside a link keeps the link; elsewhere a click opens the viewer.
        if (!src || event.currentTarget.closest('a')) {
          return
        }
        event.preventDefault()
        viewer.open(event.currentTarget.currentSrc || src, title)
      }}
    />
  )
}
