// 直连 Orca runtime socket 的终端后端,给宿主拉起的驱动用。
//
// 只在打成单文件的驱动里生效:它 import 的是 src/cli/runtime 的 TypeScript,
// 由 config/scripts/build-goal-driver.mjs 一起打进去。CLI 路径(orca-goal 命令)不走这里。
// 语义(单行校验、accepted 判定)留在 orca-terminal.mjs,这里只做传输。
import { RuntimeClient, RuntimeRpcFailureError } from '../../src/cli/runtime/index.ts'

/**
 * @param {object} [options]
 * @param {string} [options.userDataPath] runtime 元数据所在的 userData;默认读 ORCA_USER_DATA_PATH
 * @param {number} [options.requestTimeoutMs]
 */
export function createRuntimeTerminalBackend(options = {}) {
  const client = new RuntimeClient(options.userDataPath, options.requestTimeoutMs ?? 60_000)
  const call = async (method, params, callOptions) =>
    (await client.call(method, params, callOptions)).result

  return {
    async listTerminals() {
      const result = await call('terminal.list', {})
      return result?.terminals || []
    },
    async listAgentRows() {
      const result = await call('worktree.ps', {})
      return (result?.worktrees || []).flatMap((w) => w.agents || [])
    },
    async showTerminal(handle) {
      return (await call('terminal.show', { terminal: handle })).terminal
    },
    async readTerminal(handle, { limit = 2000, cursor } = {}) {
      const params = { terminal: handle, limit }
      if (cursor != null) {
        params.cursor = String(cursor)
      }
      return (await call('terminal.read', params)).terminal
    },
    async send(handle, text, { enter = true, interrupt = false } = {}) {
      const result = await call(
        'terminal.send',
        { terminal: handle, text, enter, ...(interrupt ? { interrupt: true } : {}) },
        { timeoutMs: 120_000 }
      )
      return result.send
    },
    /** @returns {{idle: boolean, reason: string}} 超时不抛错 —— 「还在干活」不是异常。 */
    async waitIdle(handle, timeoutMs) {
      try {
        const result = await call('terminal.wait', { terminal: handle, for: 'tui-idle', timeoutMs })
        return result.wait?.satisfied === false
          ? { idle: false, reason: 'timeout' }
          : { idle: true, reason: 'tui-idle' }
      } catch (err) {
        if (err instanceof RuntimeRpcFailureError && err.code === 'timeout') {
          return { idle: false, reason: 'timeout' }
        }
        throw err
      }
    }
  }
}
