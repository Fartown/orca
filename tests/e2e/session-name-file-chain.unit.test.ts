import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { listClaudeSubagentSessions } from '../../src/main/ai-vault/session-scanner-claude-subagents'
import { getScannedSessionDisplayName } from '../../src/renderer/src/session-names/session-name-display'
import { sessionNameStore } from '../../src/renderer/src/session-names/session-name-store'

const roots: string[] = []
afterEach(async () => {
  sessionNameStore.reset()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

it.each([undefined, 'Child explicit rename', '继续'])(
  'keeps the child native %s or sidecar name through real parsing and public display',
  async (nativeName) => {
    const root = await mkdtemp(join(tmpdir(), 'orca-child-name-'))
    roots.push(root)
    const parentFilePath = join(root, 'parent.jsonl')
    const subagentsDir = join(root, 'parent', 'subagents')
    await mkdir(subagentsDir, { recursive: true })
    await writeFile(
      parentFilePath,
      `${JSON.stringify({ type: 'custom-title', customTitle: 'Parent title' })}\n`
    )
    const records: unknown[] = [
      {
        type: 'user',
        sessionId: 'parent',
        isSidechain: true,
        agentId: 'child',
        message: { role: 'user', content: 'Review the entire parser implementation' }
      }
    ]
    if (nativeName) {
      records.push({ type: 'custom-title', customTitle: nativeName })
    }
    await writeFile(
      join(subagentsDir, 'agent-child.jsonl'),
      `${records.map((r) => JSON.stringify(r)).join('\n')}\n`
    )
    await writeFile(
      join(subagentsDir, 'agent-child.meta.json'),
      JSON.stringify({ description: 'Parser review', agentType: 'Explore' })
    )
    sessionNameStore.publish('local', {
      titles: [],
      nameEvidence: [
        {
          agent: 'claude',
          sessionId: 'parent',
          providerName: { kind: 'named', title: 'Parent title', field: 'custom-title.customTitle' }
        }
      ]
    })
    const result = await listClaudeSubagentSessions({ parentFilePath })
    expect(result.issues).toEqual([])
    const child = result.sessions[0]
    expect(child.sessionId).toBe('parent')
    expect(child.subagent?.parentSessionId).toBe('parent')
    expect(child.title).toBe('Parser review')
    expect(getScannedSessionDisplayName(child)).toBe(nativeName ?? 'Parser review')
    expect(child.providerName).toMatchObject({
      kind: 'named',
      title: nativeName ?? 'Parser review'
    })
    sessionNameStore.seed(result.sessions)
    expect([...sessionNameStore.getSnapshot().values()].map((slot) => slot.title)).toEqual([
      'Parent title'
    ])
  }
)
