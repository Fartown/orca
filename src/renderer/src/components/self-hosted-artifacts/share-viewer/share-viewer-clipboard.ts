/** Text copy that also works on a plain-http LAN page, where `navigator.clipboard` is absent. */
async function writeClipboardText(text: string): Promise<void> {
  if (window.isSecureContext && navigator.clipboard) {
    await navigator.clipboard.writeText(text)
    return
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.append(area)
  area.select()
  const copied = document.execCommand('copy')
  area.remove()
  if (!copied) {
    throw new Error('The browser refused to copy.')
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, payload] = dataUrl.split(',', 2)
  const type = /^data:([^;,]+)/.exec(header ?? '')?.[1] ?? 'image/png'
  const bytes = Uint8Array.from(atob(payload ?? ''), (char) => char.charCodeAt(0))
  return new Blob([bytes], { type })
}

/** Browsers only allow image copy on secure pages; on a LAN link the viewer reports the failure. */
async function writeClipboardImage(dataUrl: string): Promise<void> {
  if (
    !window.isSecureContext ||
    !navigator.clipboard?.write ||
    typeof ClipboardItem === 'undefined'
  ) {
    throw new Error('Copying images needs an https page.')
  }
  const blob = dataUrlToBlob(dataUrl)
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
}

// Why: the reused code block and image viewer copy through Orca's desktop bridge, which a browser
// reading a share link does not have; this page provides just the two calls they make.
export function installShareViewerClipboard(): void {
  Reflect.set(window, 'api', { ui: { writeClipboardText, writeClipboardImage } })
}
