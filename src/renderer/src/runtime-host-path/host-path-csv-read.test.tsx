// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenFile } from '@/store/slices/editor'
import type { FileContent } from '@/components/editor/editor-panel-content-types'

const mocks = vi.hoisted(() => ({
  readEditorCsvFileContent: vi.fn(),
  findWorkspaceFileRoute: vi.fn()
}))

vi.mock('@/components/editor/csv/csv-file-content', () => ({
  readEditorCsvFileContent: mocks.readEditorCsvFileContent
}))
vi.mock('@/lib/runtime-workspace-file-route', () => ({
  findWorkspaceFileRoute: mocks.findWorkspaceFileRoute
}))
vi.mock('@/lib/connection-context', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getConnectionIdForFile: () => null,
  isWorktreeConnectionResolved: () => true
}))

import { useEditorPanelFileContentLoader } from '@/components/editor/useEditorPanelFileContentLoader'

const GRANT = { grantId: 'grant-1', absolutePath: '/data/exports/report.csv' }

function grantedCsvTab(overrides: Partial<OpenFile> = {}): OpenFile {
  return {
    id: 'tab-granted-csv',
    filePath: GRANT.absolutePath,
    // Why relativePath === filePath: that is how a tab outside the worktree is stored.
    relativePath: GRANT.absolutePath,
    worktreeId: 'repo::/work',
    language: 'csv',
    isDirty: false,
    mode: 'edit',
    runtimeEnvironmentId: 'env-1',
    runtimeHostPathGrant: GRANT,
    ...overrides
  }
}

async function load(file: OpenFile): Promise<Record<string, FileContent>> {
  let contents: Record<string, FileContent> = {}
  const { result } = renderHook(() =>
    useEditorPanelFileContentLoader({
      fileLoadRetryAttemptsRef: { current: {} },
      fileReadGenerationCounterRef: { current: 0 },
      fileReadGenerationRef: { current: {} },
      openFilesRef: { current: [file] },
      outstandingFileReadsRef: { current: {} },
      setFileContents: (updater) => {
        contents = typeof updater === 'function' ? updater(contents) : updater
      }
    })
  )
  await result.current(file.filePath, file.id, file.worktreeId, file.relativePath)
  return contents
}

describe('a paired-host CSV opened through a host path grant', () => {
  beforeEach(() => {
    mocks.readEditorCsvFileContent.mockReset()
    mocks.readEditorCsvFileContent.mockResolvedValue({ content: 'a,b\n1,2\n', isBinary: false })
    mocks.findWorkspaceFileRoute.mockReset().mockReturnValue(null)
  })

  it('reads the whole file through the grant instead of the worktree-relative paged preview', async () => {
    const contents = await load(grantedCsvTab())

    expect(contents['tab-granted-csv']?.loadError).toBeUndefined()
    expect(mocks.readEditorCsvFileContent).toHaveBeenCalledTimes(1)
    const [args, allowPagedPreview] = mocks.readEditorCsvFileContent.mock.calls[0]!
    expect(args).toMatchObject({ filePath: GRANT.absolutePath, hostPathGrant: GRANT })
    expect(allowPagedPreview).toBe(false)
  })

  it('still refuses the same external path when the tab holds no grant', async () => {
    const contents = await load(grantedCsvTab({ runtimeHostPathGrant: undefined }))

    expect(mocks.readEditorCsvFileContent).not.toHaveBeenCalled()
    expect(contents['tab-granted-csv']?.loadError).toBe(
      'External local files are not available for remote workspaces.'
    )
  })
})
