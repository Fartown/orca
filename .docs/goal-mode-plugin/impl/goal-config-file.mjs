// 目标配置文件。用 JSON 而不是 YAML:零依赖,而且长目标描述放进版本库后可以走 code review。
// 命令行上显式给的参数优先级高于文件。
import { promises as fs } from 'node:fs'
import path from 'node:path'

const FIELDS = {
  objective: 'string|lines',
  check: 'strings',
  checkTimeout: 'number',
  maxTurns: 'number',
  maxMinutes: 'number',
  worktree: 'string',
  terminal: 'string',
  promptFile: 'boolean'
}

export async function loadGoalConfig(file) {
  const abs = path.resolve(file)
  let raw
  try {
    raw = await fs.readFile(abs, 'utf8')
  } catch (err) {
    throw new Error(
      err.code === 'ENOENT' ? `配置文件不存在: ${abs}` : `读取 ${abs} 失败: ${err.message}`
    )
  }

  let config
  try {
    config = JSON.parse(stripComments(raw))
  } catch (err) {
    throw new Error(`${abs} 不是合法 JSON: ${err.message}`)
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error(`${abs} 顶层必须是一个对象`)
  }

  for (const [key, value] of Object.entries(config)) {
    const kind = FIELDS[key]
    if (!kind) {
      throw new Error(`${abs} 里有未知字段 "${key}"。可用字段:${Object.keys(FIELDS).join(', ')}`)
    }
    check(abs, key, kind, value)
  }
  if (Array.isArray(config.objective)) {
    config.objective = config.objective.join('\n')
  }

  // worktree 用相对路径时,以配置文件所在目录为基准 —— 否则把文件挪个地方就失效了。
  if (config.worktree) {
    config.worktree = path.resolve(path.dirname(abs), config.worktree)
  }
  return config
}

function check(file, key, kind, value) {
  const fail = (want) => {
    throw new Error(`${file} 的 "${key}" 应当是${want},实际是 ${JSON.stringify(value)}`)
  }
  if (kind === 'string' && typeof value !== 'string') {
    fail('字符串')
  }
  if (kind === 'boolean' && typeof value !== 'boolean') {
    fail('true 或 false')
  }
  // 0 是有意义的取值:预算写 0 表示不限,和 Codex 默认的 unbounded 对齐。
  if (kind === 'number' && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
    fail('非负数(预算写 0 表示不限)')
  }
  if (kind === 'string|lines') {
    const ok =
      typeof value === 'string' ||
      (Array.isArray(value) && value.every((v) => typeof v === 'string'))
    if (!ok) {
      fail('字符串,或字符串数组(每项一行)')
    }
  }
  if (kind === 'strings') {
    if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
      fail('字符串数组')
    }
  }
}

/** 允许整行 // 注释,方便在配置里写清楚每条验收命令是干嘛的。 */
function stripComments(text) {
  return text
    .split('\n')
    .map((line) => (/^\s*\/\//.test(line) ? '' : line))
    .join('\n')
}
