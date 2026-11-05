import { createRoot } from 'react-dom/client'
import { ShareViewerPage } from './ShareViewerPage'
import { SHARE_ROOT_ELEMENT_ID, readShareDocument } from './viewer-document'
import './viewer.css'

const shared = readShareDocument(window.document)
const root = window.document.getElementById(SHARE_ROOT_ELEMENT_ID)
if (shared && root) {
  window.document.title = shared.title
  createRoot(root).render(<ShareViewerPage document={shared} />)
}
