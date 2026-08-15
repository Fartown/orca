// 工作区内容指纹。用临时索引 + write-tree 拿一个真正覆盖「已跟踪改动 + 未跟踪新文件」的 tree SHA:
// git status --porcelain 对内容变化是瞎的,git diff HEAD 对未跟踪文件是瞎的,只有 tree SHA 两样都覆盖。
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const GIT_TIMEOUT_MS = 60_000

async function git(args, cwd, extraEnv) {
  const { stdout } = await run('git', args, {
    cwd,
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, ...extraEnv }
  })
  return stdout.trim()
}

/**
 * @returns {{kind:'git', tree:string, head:string|null}|{kind:'unavailable', reason:string}}
 * 拿不到指纹时**不**伪造一个值 —— 上层据此关掉空转熔断,而不是把「测不出变化」当成「没变化」。
 */
export async function snapshotWorktree(worktreePath) {
  try {
    await git(['rev-parse', '--is-inside-work-tree'], worktreePath)
  } catch {
    return { kind: 'unavailable', reason: '不是 git 工作区(文件夹工作区无内容指纹)' }
  }

  const indexFile = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'orca-goal-idx-')), 'index')
  try {
    // 从空索引 add -A,得到的 tree 就是当前工作区内容的精确快照(仍然尊重 .gitignore)。
    await git(['add', '-A'], worktreePath, { GIT_INDEX_FILE: indexFile })
    const tree = await git(['write-tree'], worktreePath, { GIT_INDEX_FILE: indexFile })
    const head = await git(['rev-parse', 'HEAD'], worktreePath).catch(() => null)
    return { kind: 'git', tree, head, excludeHash: await hashExclude(worktreePath) }
  } catch (err) {
    return { kind: 'unavailable', reason: `git 快照失败: ${err.message.split('\n')[0]}` }
  } finally {
    await fs.rm(path.dirname(indexFile), { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * .git/info/exclude 不在 tree 里,但它会让 `git add -A` 忽略文件 —— 往里加一条规则
 * 就能让改动从内容指纹里消失。所以单独记它的哈希。
 */
async function hashExclude(worktreePath) {
  try {
    const gitDir = await git(['rev-parse', '--absolute-git-dir'], worktreePath)
    const body = await fs.readFile(path.join(gitDir, 'info', 'exclude'), 'utf8')
    return createHash('sha256').update(body).digest('hex').slice(0, 16)
  } catch {
    return null // 文件不存在是常态
  }
}

/** 两个 tree 之间指定路径的 unified diff,用来看测试文件到底被改成了什么样。 */
export async function diffText(worktreePath, before, after, paths) {
  if (before?.kind !== 'git' || after?.kind !== 'git' || paths.length === 0) {
    return ''
  }
  try {
    return await git(
      ['diff', '--unified=0', '--no-color', before.tree, after.tree, '--', ...paths],
      worktreePath
    )
  } catch {
    return ''
  }
}

const TEST_PATH =
  /(^|\/)(tests?|__tests__|spec|specs|e2e)\/|[._-](test|spec)\.[cm]?[jt]sx?$|_test\.(go|py|rb)$|Test\.java$/i

/**
 * 上一轮到这一轮真正改了哪些文件 —— 与 agent 自己的叙述无关的地面真相。
 * 直接 diff 两个 tree,不碰工作区也不碰真索引。
 */
export async function diffTrees(worktreePath, before, after) {
  if (before?.kind !== 'git' || after?.kind !== 'git') {
    return null
  }
  if (before.tree === after.tree) {
    return { source: [], test: [] }
  }
  try {
    const out = await git(['diff', '--name-only', before.tree, after.tree], worktreePath)
    const files = out ? out.split('\n').filter(Boolean) : []
    return {
      source: files.filter((f) => !TEST_PATH.test(f)),
      test: files.filter((f) => TEST_PATH.test(f))
    }
  } catch {
    return null
  }
}

/** 两个快照是否等价。任一侧不可用都返回 null(未知),绝不返回 true。 */
export function sameSnapshot(a, b) {
  if (!a || !b || a.kind !== 'git' || b.kind !== 'git') {
    return null
  }
  return a.tree === b.tree && a.head === b.head
}
