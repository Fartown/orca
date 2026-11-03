export function buildCodexNestedHookGuard(target: 'posix' | 'win32'): string[] {
  // Codex injects this caller identity into shell tools, not native subagent hooks.
  // Windows callers may hold stdin open, so the skip exits without a drain like the other guards.
  return target === 'win32'
    ? ['if defined CODEX_THREAD_ID exit /b 0']
    : ['if [ -n "${CODEX_THREAD_ID:-}" ]; then', '  exit 0', 'fi']
}
