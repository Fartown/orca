// 叫守卫前备齐材料:对话摘要、改动、历史会话,以及续跑消息指向的目标原文文件。只整理,不判断。
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { diffTrees, snapshotWorktree } from './git-snapshot.mjs'
import {
  describeGoalSessionHistory,
  goalSessionHistorySources,
  sessionHistoryFromTranscript
} from '../../src/shared/goals/goal-agent-provider.ts'

export const AUTO_MESSAGE_PREFIX = '【Goal 自动消息】'
const RECENT_SENT_LIMIT = 5

/** 解析复用原生聊天的 TypeScript 解码器,只在打包后的驱动里按需加载;测试注入替身。 */
async function defaultDigestTranscript(input) {
  const { digestGoalTranscript } = await import('../../src/main/goals/goal-transcript-digest.ts')
  return digestGoalTranscript(input)
}

/** 驱动写给守卫和执行 agent 看的文件放这里:宿主模式是目标目录下的 guard/。 */
export function goalFilesDir(goal) {
  return goal.guard?.logDir || path.join(os.tmpdir(), 'orca-goal', goal.key)
}

/** 续跑消息只带路径,原文在这个文件里;每次发消息前按当前目标重写。 */
export async function writeObjectiveFile(goal) {
  const file = path.join(goalFilesDir(goal), 'objective.md')
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  await fs.writeFile(tmp, `${goal.objective}\n`, 'utf8')
  await fs.rename(tmp, file)
  return file
}

/** 记下发出的消息,摘要靠它认出驱动消息和被截断的碎片。 */
export function rememberSent(goal, text, at) {
  const recent = [...(goal.recentSent || []), { at, text }].slice(-RECENT_SENT_LIMIT)
  return { ...goal, recentSent: recent }
}

/**
 * @returns {Promise<{ vars: object, cursor: object | null }>}
 *   cursor 是这次摘要读到的位置,守卫结论生效后才记下;没生效的话下次从同一处再读。
 */
export async function guardMaterials(run, wakeText, { sequence, digestTranscript }) {
  const goal = run.current
  const row = run.lastRow
  const family = row?.agentType === 'codex' || row?.agentType === 'claude' ? row.agentType : null
  const own = sessionHistoryFromTranscript(row?.transcriptPath, family)
  const found = await goalSessionHistorySources(
    goal.worktreePath,
    os.homedir(),
    family ? [family] : ['claude', 'codex']
  ).catch(() => [])
  const history = own ? [own, ...found.filter((source) => source.path !== own.path)] : found
  const digest = await digestFor(goal, row, family, sequence, digestTranscript)
  return {
    cursor: digest.cursor,
    vars: {
      wakeReason: wakeText,
      objective: goal.objective,
      checklistPath: goal.checklistPath || '无（以目标原文为准）',
      previousNote: goal.guardNote || '（首次复盘，还没有笔记）',
      digestPath: digest.path,
      transcriptPath: row?.transcriptPath || '不可用（状态存储没有给出对话记录路径）',
      orcaCommand: process.env.ORCA_BIN || defaultOrcaCommand(),
      terminalHandle: goal.terminalHandle,
      sessionDir: describeGoalSessionHistory(history),
      changes: await describeChanges(run),
      checkFailures: run.checkFailures || '无',
      openQuestion: goal.awaitingUser?.reason || '无'
    }
  }
}

async function digestFor(goal, row, family, sequence, digestTranscript = defaultDigestTranscript) {
  if (!row?.transcriptPath) {
    return { path: '不可用（状态存储没有给出对话记录路径），看终端画面', cursor: null }
  }
  if (!family) {
    const agent = row.agentType || '这个 agent'
    return { path: `不可用（不支持 ${agent} 的对话记录格式），看终端画面`, cursor: null }
  }
  try {
    const digest = await digestTranscript({
      path: row.transcriptPath,
      family,
      cursor: goal.transcriptCursor ?? null,
      sent: goal.recentSent || [],
      autoPrefix: AUTO_MESSAGE_PREFIX
    })
    const file = path.join(goalFilesDir(goal), `${sequence}-transcript.md`)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, digest.text, 'utf8')
    return { path: file, cursor: digest.cursor }
  } catch (err) {
    return {
      path: `不可用（整理对话记录失败：${err?.message || err}），直接检索完整记录或看终端画面`,
      cursor: null
    }
  }
}

function defaultOrcaCommand() {
  return process.platform === 'linux'
    ? 'orca-ide'
    : process.platform === 'win32'
      ? 'orca.cmd'
      : 'orca'
}

/** 上次复盘以来改了哪些文件。拿不到指纹(文件夹工作区)时如实说不可用。 */
async function describeChanges(run) {
  try {
    const after = await snapshotWorktree(run.current.worktreePath)
    const before = run.snapshot
    run.snapshot = after
    run.current = { ...run.current, lastSnapshot: after }
    if (after.kind !== 'git') {
      return `不可用（${after.reason}）`
    }
    if (!before || before.kind !== 'git') {
      return '首次复盘，没有可比较的基线'
    }
    const changed = await diffTrees(run.current.worktreePath, before, after)
    const files = [...changed.source, ...changed.test]
    if (files.length === 0) {
      return '无改动'
    }
    return `${files.slice(0, 40).join('、')}${files.length > 40 ? ` 等 ${files.length} 个文件` : ''}`
  } catch (err) {
    return `不可用（${err?.message || err}）`
  }
}
