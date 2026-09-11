import { WINDOWS_HOOK_STDIN_DRAIN_LABEL } from '../agent-hooks/hook-stdin-contract'

export function buildCodexNestedHookGuard(target: 'posix' | 'win32'): string[] {
  // Codex injects this caller identity into shell tools, not native subagent hooks.
  return target === 'win32'
    ? [`if defined CODEX_THREAD_ID goto :${WINDOWS_HOOK_STDIN_DRAIN_LABEL}`]
    : ['if [ -n "${CODEX_THREAD_ID:-}" ]; then', '  exit 0', 'fi']
}
