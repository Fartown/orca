import { describe, expect, it } from 'vitest'
import {
  classifyTabEntryQuery,
  getTabEntryAbsolutePathRemoteBlockedMessage
} from '../tab-bar/create-entry/tab-create-entry-classifier'

const readyFiles = (files: string[]) => ({ files, loading: false, loadError: null })

describe('tab create entry absolute path classification by owning host', () => {
  it('offers absolute paths wherever they point once the host is resolved', () => {
    const context = { allowAbsolutePaths: true, localPlatform: 'posix' as const }

    for (const filePath of ['/tmp/notes.md', '/repo/src/index.ts', '/etc/hosts']) {
      expect(classifyTabEntryQuery(filePath, readyFiles([]), context)).toEqual({
        kind: 'absolute-file',
        filePath
      })
    }
  })

  it('blocks absolute paths until the workspace host is resolved', () => {
    for (const query of [
      '/tmp/notes.md',
      'C:\\tmp\\notes.md',
      'C:/tmp/notes.md',
      '\\\\server\\share\\notes.md',
      '//server/share/notes.md'
    ]) {
      expect(classifyTabEntryQuery(query, readyFiles([]))).toMatchObject({
        kind: 'blocked',
        message: getTabEntryAbsolutePathRemoteBlockedMessage()
      })
    }
  })
})
