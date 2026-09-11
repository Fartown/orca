export function removeCodexToolCallerIdentity(env: NodeJS.ProcessEnv): void {
  // A new Orca-owned PTY is not a tool subprocess of the agent that launched its host.
  for (const key of Object.keys(env)) {
    if ((process.platform === 'win32' ? key.toUpperCase() : key) === 'CODEX_THREAD_ID') {
      delete env[key]
    }
  }
}
