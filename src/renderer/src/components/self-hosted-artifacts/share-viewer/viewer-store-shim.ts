import { create } from 'zustand'
import { MARKDOWN_TOC_PANEL_DEFAULT_WIDTH } from '../../../../../shared/markdown-toc-panel-width'

type ShareViewerModal = 'none' | 'diagram-viewer'

type ShareViewerStore = {
  markdownTocPanelWidth: number
  setMarkdownTocPanelWidth: (width: number) => void
  activeModal: ShareViewerModal
  modalData: Record<string, unknown>
  openModal: (modal: ShareViewerModal, data?: Record<string, unknown>) => void
  closeModal: () => void
}

// Why: the share page bundles the app's TOC panel and diagram viewer, which read only these fields.
export const useAppStore = create<ShareViewerStore>((set) => ({
  markdownTocPanelWidth: MARKDOWN_TOC_PANEL_DEFAULT_WIDTH,
  setMarkdownTocPanelWidth: (width) => set({ markdownTocPanelWidth: width }),
  activeModal: 'none',
  modalData: {},
  openModal: (modal, data = {}) => set({ activeModal: modal, modalData: data }),
  closeModal: () => set({ activeModal: 'none', modalData: {} })
}))
