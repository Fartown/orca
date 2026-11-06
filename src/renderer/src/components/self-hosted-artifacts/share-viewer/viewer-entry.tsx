import { createRoot } from 'react-dom/client'
import { ShareViewerPage } from './ShareViewerPage'
import { installShareViewerClipboard } from './share-viewer-clipboard'
import { SHARE_ROOT_ELEMENT_ID, readShareDocument } from './viewer-document'
import { getShareViewerLanguage } from './viewer-i18n-shim'
import './viewer.css'

const shared = readShareDocument(window.document)
const root = window.document.getElementById(SHARE_ROOT_ELEMENT_ID)
if (shared && root) {
  installShareViewerClipboard()
  window.document.title = shared.title
  // Why: screen readers and CJK font fallback follow the language the page's copy is shown in.
  window.document.documentElement.lang = getShareViewerLanguage()
  createRoot(root).render(<ShareViewerPage document={shared} />)
}
