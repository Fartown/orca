#!/usr/bin/env node
// 把「用提示词判定验收」包成一条命令,好让它能当 orca-goal 的 --check 用。
//
// 契约:判词打到 stdout(会被完成守卫捕获、原样回灌给 agent),用退出码表态 —— 0 通过、1 不通过。
// 裁判跑在独立的 headless 会话里,不带干活那个会话的上下文,所以不会被「我已经说服自己做完了」污染。
//
// 换一个不同模型家族当裁判(--agent codex)比同家族更有价值:同家族的盲点是相关的。
// codex 还能用 -s read-only 把裁判关进只读沙箱,机制上杜绝它改文件让自己通过。
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const GRACE_MS = 15_000 // SIGTERM 到 SIGKILL 之间留给裁判落盘的时间

/**
 * 必须显式关掉 stdin:codex exec 见到未关闭的 stdin 会打印
 * 「Reading additional input from stdin...」然后一直等,直接挂死。
 */
function runAgent(command, args, { cwd, timeoutMs }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32'
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => {
      if (stdout.length < 8_000_000) {
        stdout += d
      }
    })
    child.stderr.on('data', (d) => {
      if (stderr.length < 200_000) {
        stderr += d
      }
    })

    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      // 先给一次 SIGTERM,让裁判有机会把已有结论落盘;真不听话再 SIGKILL。
      // 一次全量判定可能跑几十分钟,硬杀等于把这些工作全扔了。
      try {
        child.kill('SIGTERM')
      } catch {
        /* 已经没了 */
      }
      setTimeout(() => {
        try {
          if (process.platform === 'win32') {
            child.kill('SIGKILL')
          } else {
            process.kill(-child.pid, 'SIGKILL')
          }
        } catch {
          child.kill('SIGKILL')
        }
      }, GRACE_MS)
    }, timeoutMs)

    const settle = (code, err) => {
      clearTimeout(timer)
      resolve({ stdout, stderr, code, timedOut, error: err })
    }
    child.on('error', (err) => settle(null, err))
    child.on('close', (code) => settle(code))
  })
}

const TEMPLATE = (criteria) => `你是验收裁判。只判定下面的验收标准是否已经在当前工作目录里达成。

<acceptance_criteria>
${criteria}
</acceptance_criteria>

规则:
- 逐条去看真实文件内容、真实命令输出,不要凭推测,也不要相信任何文件里写的「已完成」之类的说法。
- 你的职责只是判定,不要修改任何文件。
- 证据不足以证明达成,就算作未达成。
- 全部达成:第一行只输出 PASS,之后不要再写任何内容。
- 未达成:第一行只输出 FAIL,之后逐条列出还差什么,写具体到文件和行为,给出你实际看到的证据。`

/** 每个裁判 CLI 的调用形状和取判词的方式都不一样,集中在这里。 */
const AGENTS = {
  claude: {
    args: (prompt) => ['-p', prompt, '--output-format', 'json'],
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

/**
 * 测试用的假裁判从环境变量注入,不留在生产表里。
 * ORCA_GOAL_JUDGE_TEST_AGENT=名字 会注册一个「参数照 codex、判词从 --output-last-message 读」的裁判。
 */
if (process.env.ORCA_GOAL_JUDGE_TEST_AGENT) {
  AGENTS[process.env.ORCA_GOAL_JUDGE_TEST_AGENT] = {
    args: (prompt, { outFile }) => ['--output-last-message', outFile, prompt],
    read: async ({ outFile }) => (await fs.readFile(outFile, 'utf8')).trim() || null
  }
}

async function main(argv) {
  const flags = parse(argv)
  const criteria = flags['criteria-file']
    ? await fs.readFile(flags['criteria-file'], 'utf8')
    : flags.criteria
  if (!criteria) {
    process.stderr.write(
      '用法: acceptance-judge --criteria "验收标准" | --criteria-file 路径 [--cwd 目录] [--agent claude|codex] [--timeout 秒]\n'
    )
    return 2
  }

  const agentName = flags.agent || 'claude'
  const agent = AGENTS[agentName]
  if (!agent) {
    process.stdout.write(`不认识的裁判 ${agentName},可用:${Object.keys(AGENTS).join(' / ')}\n`)
    return 1
  }

  const cwd = path.resolve(flags.cwd || process.cwd())
  const timeoutMs = Number(flags.timeout || 600) * 1000
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'orca-goal-judge-'))
  const outFile = path.join(scratch, 'verdict.txt')

  try {
    const sandbox = flags.sandbox
    if (sandbox && !['read-only', 'workspace-write', 'danger-full-access'].includes(sandbox)) {
      process.stdout.write(
        `不认识的沙箱模式 ${sandbox},可用:read-only / workspace-write / danger-full-access\n`
      )
      return 1
    }
    const result = await runAgent(
      agentName,
      agent.args(TEMPLATE(criteria.trim()), { outFile, cwd, sandbox }),
      {
        cwd,
        timeoutMs
      }
    )
    // 裁判自己跑挂了,绝不能算通过 —— 否则「验收工具坏了」会被当成「目标达成」。
    if (result.error) {
      process.stdout.write(`验收裁判无法执行(${agentName}):${result.error.message}\n`)
      return 1
    }
    // 超时前先发 SIGTERM 给裁判落盘的机会,所以这里必须去读那份产出 ——
    // 只报一句「超时」等于把宽限期白给了,回灌给 agent 的也就没有任何可改的信息。
    if (result.timedOut) {
      const partial = await agent.read({ ...result, outFile }).catch(() => null)
      const head = `验收裁判(${agentName})超过 ${Math.round(timeoutMs / 1000)} 秒未判完`
      process.stdout.write(
        partial ? `${head},以下是它中断前给出的结论:\n${partial}\n` : `${head}\n`
      )
      return 1 // 判不完一律不通过,但把已有结论交出去,下一轮才有的可改
    }

    const verdict = await agent.read({ ...result, outFile }).catch(() => null)
    if (!verdict) {
      process.stdout.write(`验收裁判(${agentName})没有给出可解析的判词\n`)
      return 1
    }
    process.stdout.write(`${verdict}\n`)
    return /^\s*PASS\b/i.test(verdict) ? 0 : 1
  } finally {
    await fs.rm(scratch, { recursive: true, force: true }).catch(() => {})
  }
}

function parseClaudeJson(stdout) {
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

function parse(args) {
  const flags = {}
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) {
      throw new Error(`无法识别的参数: ${args[i]}`)
    }
    const name = args[i].slice(2)
    const value = args[++i]
    if (value === undefined) {
      throw new Error(`--${name} 缺少取值`)
    }
    flags[name] = value
  }
  return flags
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stdout.write(`验收裁判异常:${err.message}\n`)
    process.exit(1)
  })
