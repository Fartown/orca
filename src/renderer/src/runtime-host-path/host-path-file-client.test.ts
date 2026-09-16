import { describe, expect, it, vi } from 'vitest'
import {
  isExpiredHostPathGrantError,
  readHostPathFile,
  requestHostPathGrant,
  withFreshHostPathGrant,
  writeHostPathFile,
  type RuntimeHostPathGrant
} from './host-path-file-client'

const GRANT: RuntimeHostPathGrant = { grantId: 'grant-1', absolutePath: '/etc/hosts' }

function hostAnswering(answers: Record<string, unknown>) {
  return vi.fn(async (method: string) => {
    if (!(method in answers)) {
      throw new Error(`unexpected method ${method}`)
    }
    const answer = answers[method]
    if (answer instanceof Error) {
      throw answer
    }
    return answer
  })
}

describe('requestHostPathGrant', () => {
  it('returns the grant the host minted', async () => {
    const call = hostAnswering({
      'files.grantHostPath': {
        worktree: 'wt-1',
        relativePath: null,
        absolutePath: '/etc/hosts',
        exists: true,
        isDirectory: false,
        openTarget: {
          kind: 'absolute-file',
          provider: 'local',
          absolutePath: '/etc/hosts',
          grantId: 'grant-1'
        }
      }
    })

    await expect(requestHostPathGrant(call, 'id:wt-1', '/etc/hosts')).resolves.toEqual(GRANT)
    expect(call).toHaveBeenCalledWith('files.grantHostPath', {
      worktree: 'id:wt-1',
      absolutePath: '/etc/hosts'
    })
  })

  it('reports a missing host file rather than returning an unusable grant', async () => {
    const call = hostAnswering({
      'files.grantHostPath': {
        worktree: 'wt-1',
        relativePath: null,
        absolutePath: '/nope',
        exists: false,
        isDirectory: false
      }
    })

    await expect(requestHostPathGrant(call, 'id:wt-1', '/nope')).rejects.toThrow(
      'File not found on the host: /nope'
    )
  })
})

describe('readHostPathFile / writeHostPathFile', () => {
  it('reads through the terminal-artifact method with the grant', async () => {
    const call = hostAnswering({
      'files.readTerminalArtifact': { content: '127.0.0.1 localhost\n', truncated: false }
    })

    await expect(readHostPathFile(call, 'id:wt-1', GRANT)).resolves.toEqual({
      content: '127.0.0.1 localhost\n',
      isBinary: false
    })
    expect(call).toHaveBeenCalledWith('files.readTerminalArtifact', {
      worktree: 'id:wt-1',
      grantId: 'grant-1',
      absolutePath: '/etc/hosts'
    })
  })

  it('refuses a truncated answer instead of handing back a savable prefix', async () => {
    // Why this case exists: files.readTerminalArtifact truncates like files.read does, but a
    // granted path has no files.readChunk form to finish on. Returning the prefix would let the
    // next save drop the rest of the host's file.
    const call = hostAnswering({
      'files.readTerminalArtifact': { content: 'prefix', truncated: true, byteLength: 524_288 }
    })

    await expect(readHostPathFile(call, 'id:wt-1', GRANT)).rejects.toThrow(
      'Host file is too large to open in the editor (524288 bytes)'
    )
  })

  it('writes through the terminal-artifact method with the grant', async () => {
    const call = hostAnswering({ 'files.writeTerminalArtifact': undefined })

    await writeHostPathFile(call, 'id:wt-1', GRANT, 'next\n')

    expect(call).toHaveBeenCalledWith('files.writeTerminalArtifact', {
      worktree: 'id:wt-1',
      grantId: 'grant-1',
      absolutePath: '/etc/hosts',
      content: 'next\n'
    })
  })
})

describe('isExpiredHostPathGrantError', () => {
  it('recognises the host errors a fresh grant can fix', () => {
    expect(isExpiredHostPathGrantError(new Error('terminal_file_grant_expired'))).toBe(true)
    expect(isExpiredHostPathGrantError(new Error('terminal_file_grant_mismatch'))).toBe(true)
  })

  it('does not treat an unrelated failure as retryable', () => {
    // Why this matters: a retry on a permission or transport failure would re-mint a grant and
    // hide the real error behind a second identical one.
    expect(isExpiredHostPathGrantError(new Error('EACCES: permission denied'))).toBe(false)
    expect(isExpiredHostPathGrantError(new Error('socket died'))).toBe(false)
  })
})

describe('withFreshHostPathGrant', () => {
  it('passes the original grant through when nothing expired', async () => {
    const run = vi.fn(async () => 'content')
    const regrant = vi.fn(async () => ({ grantId: 'grant-2', absolutePath: '/etc/hosts' }))

    await expect(withFreshHostPathGrant(GRANT, run, regrant)).resolves.toEqual({
      result: 'content',
      grant: GRANT
    })
    expect(regrant).not.toHaveBeenCalled()
  })

  it('asks for a replacement once and hands the new grant back to the caller', async () => {
    const replacement = { grantId: 'grant-2', absolutePath: '/etc/hosts' }
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('terminal_file_grant_expired'))
      .mockResolvedValueOnce('content')
    const regrant = vi.fn(async () => replacement)

    // Why the returned grant matters: the caller stores it on the tab, so the next save does not
    // start from the dead one again.
    await expect(withFreshHostPathGrant(GRANT, run, regrant)).resolves.toEqual({
      result: 'content',
      grant: replacement
    })
    expect(run).toHaveBeenNthCalledWith(2, replacement)
    expect(regrant).toHaveBeenCalledTimes(1)
  })

  it('stops after one replacement instead of spinning', async () => {
    const run = vi.fn().mockRejectedValue(new Error('terminal_file_grant_expired'))
    const regrant = vi.fn(async () => ({ grantId: 'grant-2', absolutePath: '/etc/hosts' }))

    await expect(withFreshHostPathGrant(GRANT, run, regrant)).rejects.toThrow(
      'terminal_file_grant_expired'
    )
    expect(regrant).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('does not re-grant for a failure a new grant cannot fix', async () => {
    const run = vi.fn().mockRejectedValue(new Error('EACCES: permission denied'))
    const regrant = vi.fn()

    await expect(withFreshHostPathGrant(GRANT, run, regrant)).rejects.toThrow('EACCES')
    expect(regrant).not.toHaveBeenCalled()
  })
})
