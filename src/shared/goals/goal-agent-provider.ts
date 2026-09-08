import { promises as fs } from 'node:fs'

export type GoalAgentProvider = {
  args: (prompt: string, options: { cwd: string; outFile: string; sandbox?: string }) => string[]
  read: (result: { stdout: string; outFile: string }) => Promise<string | null>
}

export const GOAL_AGENT_PROVIDERS: Record<'claude' | 'codex', GoalAgentProvider> = {
  claude: {
    // claude 没有 codex 那样的 OS 级只读沙箱,--sandbox read-only 只能近似成「禁掉写文件的工具」。
    // 不加这层,裁判就是个能改仓库让自己通过的守卫。
    args: (prompt, { sandbox }) => [
      '-p',
      prompt,
      '--output-format',
      'json',
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
        : [])
    ],
    read: async ({ stdout }) => parseClaudeJson(stdout)
  },
  codex: {
    // 不强制沙箱:判据往往需要构建、起服务、跑测试才验得了,锁成只读会把裁判废掉。
    // 要限制就显式给 --sandbox。
    args: (prompt, { outFile, cwd, sandbox }) => [
      'exec',
      '--cd',
      cwd,
      ...(sandbox ? ['--sandbox', sandbox] : []),
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
    return null
  }
}
