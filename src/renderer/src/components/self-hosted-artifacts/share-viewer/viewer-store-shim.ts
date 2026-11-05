import { create } from 'zustand'
import { MARKDOWN_TOC_PANEL_DEFAULT_WIDTH } from '../../../../../shared/markdown-toc-panel-width'

type ShareViewerStore = {
  markdownTocPanelWidth: number
  setMarkdownTocPanelWidth: (width: number) => void
}

// Why: the share page bundles the app's TOC panel, whose only store reads are its width and setter.
export const useAppStore = create<ShareViewerStore>((set) => ({
  markdownTocPanelWidth: MARKDOWN_TOC_PANEL_DEFAULT_WIDTH,
  setMarkdownTocPanelWidth: (width) => set({ markdownTocPanelWidth: width })
}))
