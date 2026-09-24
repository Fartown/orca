import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'

export type GoalAgentProvider = {
  args: (
    prompt: string,
    options: { cwd: string; outFile: string; sandbox?: string; streamEvents?: boolean }
  ) => string[]
  read: (result: { stdout: string; outFile: string }) => Promise<string | null>
}

export const GOAL_AGENT_PROVIDERS: Record<'claude' | 'codex', GoalAgentProvider> = {
  claude: {
    // claude 没有 codex 那样的 OS 级只读沙箱,--sandbox read-only 只能近似成「禁掉写文件的工具」。
    // 不加这层,裁判就是个能改仓库让自己通过的守卫。
    args: (prompt, { sandbox, streamEvents }) => [
      '-p',
      prompt,
      '--output-format',
      ...(streamEvents ? ['stream-json', '--verbose'] : ['json']),
      // 用 bypassPermissions 而不是 dontAsk:dontAsk 会连 Bash 一起拒掉,裁判就查不了
      // git merge-base、grep 死代码、核对截图是否真存在 —— 实测过一次,它自己说「无法二次核对」。
      // 写入口靠禁用 Edit/Write/NotebookEdit 挡住;这不是 OS 沙箱,只是让裁判没有顺手改仓库的工具。
      ...(sandbox === 'read-only'
        ? [
            '--permission-mode',
            'bypassPermissions',
            '--disallowed-tools',
            'Edit,Write,NotebookEdit'
          ]
        : sandbox === 'danger-full-access'
          ? ['--permission-mode', 'bypassPermissions']
          : [])
    ],
    read: async ({ stdout }) => parseClaudeJson(stdout)
  },
  codex: {
    // 不强制沙箱:判据往往需要构建、起服务、跑测试才验得了,锁成只读会把裁判废掉。
    // 要限制就显式给 --sandbox。
    args: (prompt, { outFile, cwd, sandbox, streamEvents }) => [
      'exec',
      '--cd',
      cwd,
      ...(sandbox ? ['--sandbox', sandbox] : []),
      ...(streamEvents ? ['--json'] : []),
      '--skip-git-repo-check',
      '--output-last-message',
      outFile,
      prompt
    ],
    read: async ({ outFile }) => (await fs.readFile(outFile, 'utf8')).trim() || null
  }
}

function parseClaudeJson(stdout: string): string | null {
  const start = stdout.indexOf('{')
  const bracket = stdout.indexOf('[')
  const from = start === -1 ? bracket : bracket === -1 ? start : Math.min(start, bracket)
  if (from < 0) {
    return null
  }
  try {
    let data = JSON.parse(stdout.slice(from))
    if (Array.isArray(data)) {
      data = data.at(-1)
    }
    if (data?.is_error) {
      return `验收裁判报错:${String(data.result || '').slice(0, 500)}`
    }
    return typeof data?.result === 'string' ? data.result.trim() : null
  } catch {
    const lines = stdout.trim().split('\n')
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index]
      try {
        const event = JSON.parse(line)
        if (event.type === 'result') {
          return parseClaudeJson(line)
        }
      } catch {
        /* Partial stream lines are not results. */
      }
    }
    return null
  }
}

export type GoalAgentFamily = 'claude' | 'codex'

export type GoalSessionHistorySource = { family: GoalAgentFamily; path: string; note: string }

/** Claude Code names a project's session folder after its cwd with every non-alphanumeric char dashed. */
export function claudeProjectSessionDir(workspacePath: string, homeDir: string): string {
  return join(homeDir, '.claude', 'projects', workspacePath.replace(/[^a-zA-Z0-9]/g, '-'))
}

/**
 * Where an agent family keeps this workspace's past sessions on the execution host. Only
 * sources that exist are returned, so a prompt never presents an empty variable as searched.
 */
export async function goalSessionHistorySources(
  workspacePath: string,
  homeDir: string,
  families: readonly GoalAgentFamily[] = ['claude', 'codex'],
  exists: (path: string) => Promise<boolean> = pathExists
): Promise<GoalSessionHistorySource[]> {
  const candidates: GoalSessionHistorySource[] = families.map((family) =>
    family === 'claude'
      ? { family, path: claudeProjectSessionDir(workspacePath, homeDir), note: '本工作区的会话' }
      : {
          family,
          path: join(homeDir, '.codex', 'sessions'),
          note: `所有工作区的会话，按 cwd 为 ${workspacePath} 筛选`
        }
  )
  const found = await Promise.all(candidates.map((candidate) => exists(candidate.path)))
  return candidates.filter((_, index) => found[index])
}

/**
 * The working agent's own session folder, read off its transcript path. Orca launches agents
 * with managed homes, so this beats guessing from HOME: a codex rollout sits under
 * `CODEX_HOME/sessions/...`, a claude transcript directly in its project folder.
 */
export function sessionHistoryFromTranscript(
  transcriptPath: string | null | undefined,
  family: GoalAgentFamily | null
): GoalSessionHistorySource | null {
  if (!transcriptPath || !family) {
    return null
  }
  if (family === 'claude') {
    return { family, path: dirname(transcriptPath), note: '执行 agent 所在项目的会话' }
  }
  const marker = transcriptPath.replace(/\\/g, '/').lastIndexOf('/sessions/')
  return marker === -1
    ? null
    : {
        family,
        path: transcriptPath.slice(0, marker + '/sessions'.length),
        note: '执行 agent 所用的会话目录,按 cwd 筛选本工作区'
      }
}

export function describeGoalSessionHistory(sources: readonly GoalSessionHistorySource[]): string {
  return sources.length === 0
    ? '不可用'
    : sources.map((source) => `${source.path}（${source.family}，${source.note}）`).join('；')
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.stat(path)
    return true
  } catch {
    return false
  }
}
