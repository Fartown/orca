import { describe, expect, it } from 'vitest'
import {
  ISSUE_INDEX_PATH,
  evaluateForkDocs,
  parseFrontmatter,
  renderIssueIndex,
  tableRowsAfter
} from './check-fork-docs.mjs'

const registry = {
  schemaVersion: 1,
  upstream: { remote: 'origin', branch: 'main' },
  fork: { remote: 'fork', integrationBranch: 'fork/integration' },
  features: [
    {
      id: 'widgets',
      title: 'Widgets: a panel',
      goal: 'Let users manage widgets',
      journal: 'docs/issue/Widgets/journal.md',
      policyId: 'widgets-policy',
      ownedPaths: [],
      requiredFiles: [],
      seams: [],
      tests: [],
      checks: []
    }
  ]
}

const journal = `---
title: Widgets
slug: Widgets
status: implementing
created: 2026-09-01
updated: 2026-09-07
---

# Widgets Journal

## 1. 关键文档链接

| 类型 | 文档 | 状态 | 说明 |
| --- | --- | --- | --- |
| 需求 | [Widgets](requirements/Widgets.md) | ready | 主需求 |
| 测试用例 | [功能测试](tests/cases/Widgets功能测试.md) | reviewing | 用例 |
| 交互 | - | not-required | 无 |

## 2. 决策点记录

### D-001 something

- 日期：2026-09-01。

## 3. 开发记录

### 2026-09-07 first slice

- 本轮目标：ship it
- 完成内容：done
- 验证证据：tests pass
`

const requirements = `# Widgets

### REQ-101 列表

- 目标级别：P0；当前状态：已实现，真机未验收。

### REQ-102 删除

- 目标级别：P1；当前状态：未实现。
`

function memoryIo(files) {
  return {
    exists: (file) =>
      file in files || Object.keys(files).some((name) => name.startsWith(`${file}/`)),
    read: (file) => files[file],
    list: (dir) =>
      Object.keys(files)
        .filter((name) => name.startsWith(`${dir}/`) && !name.slice(dir.length + 1).includes('/'))
        .map((name) => name.slice(dir.length + 1))
  }
}

function healthyFiles() {
  const files = {
    'docs/issue/Widgets/journal.md': journal,
    'docs/issue/Widgets/requirements/Widgets.md': requirements,
    'docs/issue/Widgets/tests/cases/Widgets功能测试.md': '| TC-1 | REQ-101 | list |'
  }
  files[ISSUE_INDEX_PATH] = renderIssueIndex({ registry, io: memoryIo(files) })
  return files
}

describe('fork docs gate', () => {
  it('passes a journal, requirements, test cases and index that agree with each other', () => {
    expect(evaluateForkDocs({ registry, io: memoryIo(healthyFiles()) })).toEqual([])
  })

  it('reports an unknown journal status, a missing section and a dead key-document link', () => {
    const files = healthyFiles()
    files['docs/issue/Widgets/journal.md'] = journal
      .replace('status: implementing', 'status: developing')
      .replace('## 2. 决策点记录', '## 2. 决定')
      .replace('requirements/Widgets.md', 'requirements/Missing.md')
    files[ISSUE_INDEX_PATH] = renderIssueIndex({ registry, io: memoryIo(files) })
    const messages = evaluateForkDocs({ registry, io: memoryIo(files) }).map((v) => v.message)
    expect(messages).toEqual([
      expect.stringContaining('journal status "developing"'),
      expect.stringContaining('"## 2. 决策点记录" in order'),
      expect.stringContaining('missing file: requirements/Missing.md')
    ])
  })

  it('reports duplicate REQ ids, a REQ without a state, and an implemented REQ no test case covers', () => {
    const files = healthyFiles()
    files['docs/issue/Widgets/requirements/Widgets.md'] = `${requirements}
### REQ-101 again

- 目标级别：P2；当前状态：已实现。

### REQ-103 无状态

- 目标级别：P2。
`
    files['docs/issue/Widgets/tests/cases/Widgets功能测试.md'] = '| TC-1 | REQ-102 | delete |'
    files[ISSUE_INDEX_PATH] = renderIssueIndex({ registry, io: memoryIo(files) })
    const messages = evaluateForkDocs({ registry, io: memoryIo(files) }).map((v) => v.message)
    expect(messages).toEqual([
      expect.stringContaining('REQ-101 is declared twice'),
      expect.stringContaining('REQ-103 has no "当前状态：" line'),
      expect.stringContaining('REQ-101 is marked 已实现 but no test-case document')
    ])
  })

  it('requires development records to state a goal and evidence', () => {
    const files = healthyFiles()
    files['docs/issue/Widgets/journal.md'] = journal.replace('- 验证证据：tests pass\n', '')
    const messages = evaluateForkDocs({ registry, io: memoryIo(files) }).map((v) => v.message)
    expect(messages).toEqual([expect.stringContaining('lacks "- 验证证据"')])
  })

  it('flags a stale index but tolerates table padding differences', () => {
    const files = healthyFiles()
    const padded = files[ISSUE_INDEX_PATH]
      .replace('| 需求 |', '| 需求      |')
      .replace('| --- |', '| ---------- |')
    files[ISSUE_INDEX_PATH] = padded
    expect(evaluateForkDocs({ registry, io: memoryIo(files) })).toEqual([])
    files[ISSUE_INDEX_PATH] = padded.replace('implementing', 'done')
    expect(evaluateForkDocs({ registry, io: memoryIo(files) }).map((v) => v.message)).toEqual([
      expect.stringContaining('index is out of date')
    ])
  })

  it('renders the index from the registry goal and the journal status', () => {
    const index = renderIssueIndex({ registry, io: memoryIo(healthyFiles()) })
    expect(index).toContain(
      '| [Widgets](Widgets/journal.md) | Let users manage widgets | implementing |'
    )
    expect(index).toContain('[Widgets](Widgets/requirements/Widgets.md)')
    expect(index).toContain('[Widgets功能测试](Widgets/tests/cases/Widgets功能测试.md)')
  })

  it('parses frontmatter and markdown tables', () => {
    expect(parseFrontmatter('---\ntitle: X\nstatus: done\n---\nbody').fields).toEqual({
      title: 'X',
      status: 'done'
    })
    expect(tableRowsAfter('## T\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\ntext', '## T')).toEqual([
      ['1', '2']
    ])
  })
})
