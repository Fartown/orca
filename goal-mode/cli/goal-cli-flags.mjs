// orca-goal 的命令行参数文法。
//
// 单独放一份,是因为「把参数转交给后台驱动」那条路径必须按同一套文法判断哪些 token 是取值 ——
// 两边各写一份迟早会漂,而漂出来的症状是父进程报「已在后台启动」、子进程当场退出。
import path from 'node:path'

export const BOOLEAN_FLAGS = new Set(['yes', 'detach', 'prompt-file', 'check-all'])
export const VALUE_FLAGS = new Set([
  'file',
  'terminal',
  'objective',
  'on-blocked',
  'check',
  'check-timeout',
  'max-turns',
  'max-minutes',
  'worktree'
])
export const ALIASES = { f: 'file', t: 'terminal', y: 'yes' }

/**
 * 取值是路径的参数。后台驱动的 cwd 是状态目录(刻意的,见 detached-driver),
 * 相对路径到了那里必然解析错,所以这些必须在父进程里就定死成绝对路径。
 */
export const PATH_FLAGS = new Set(['file', 'worktree'])

/** `--flag`、`-f` 都归一成 flag 名;取值本身(不以 - 开头)返回 null。 */
export function flagName(token) {
  if (!token.startsWith('-')) {
    return null
  }
  const raw = token.replace(/^--?/, '')
  return ALIASES[raw] ?? raw
}

/**
 * 把路径类参数的取值换成绝对路径,其余原样保留。
 *
 * 必须按文法走而不是「看见 --file 就动下一个」:`--objective --file` 这种把 flag 名当描述
 * 传进来的写法里,那个 `--file` 是取值不是参数,再往下一个动手就改错了人。
 */
export function absolutizePathArgs(args, cwd = process.cwd()) {
  const out = [...args]
  for (let i = 0; i < out.length; i++) {
    const name = flagName(out[i])
    if (name === null || BOOLEAN_FLAGS.has(name) || !VALUE_FLAGS.has(name)) {
      continue
    }
    const value = out[++i] // 取值一律跳过,它不参与参数判定
    if (value !== undefined && PATH_FLAGS.has(name)) {
      out[i] = path.resolve(cwd, value)
    }
  }
  return out
}
