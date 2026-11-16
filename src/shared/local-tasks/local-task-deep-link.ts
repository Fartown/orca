export type LocalTaskDeepLinkTarget = { endpoint: 'local' | `runtime:${string}`; taskId: string }

const PREFIX = 'orca://tasks/v1/'
const TASK_LINK_AUTHORITY = 'orca://tasks'

export function isLocalTaskDeepLinkCandidate(value: string): boolean {
  return (
    value === TASK_LINK_AUTHORITY ||
    value.startsWith(`${TASK_LINK_AUTHORITY}/`) ||
    value.startsWith(`${TASK_LINK_AUTHORITY}?`) ||
    value.startsWith(`${TASK_LINK_AUTHORITY}#`)
  )
}

function isLocalTaskEndpoint(value: string): value is LocalTaskDeepLinkTarget['endpoint'] {
  return value === 'local' || /^runtime:[^/\\:]+$/.test(value)
}

export function localTaskDeepLink(target: LocalTaskDeepLinkTarget): string {
  return `${PREFIX}${encodeURIComponent(target.endpoint)}/${encodeURIComponent(target.taskId)}`
}

export function parseLocalTaskDeepLink(value: string): LocalTaskDeepLinkTarget | null {
  if (!value.startsWith(PREFIX)) {
    return null
  }
  try {
    const url = new URL(value)
    if (url.search || url.hash || url.origin !== 'null' || url.protocol !== 'orca:') {
      return null
    }
    const parts = url.pathname.split('/')
    if (parts.length !== 4 || parts[0] !== '' || parts[1] !== 'v1') {
      return null
    }
    const endpoint = decodeURIComponent(parts[2])
    const taskId = decodeURIComponent(parts[3])
    if (
      !taskId ||
      taskId.includes('/') ||
      taskId.includes('\\') ||
      !isLocalTaskEndpoint(endpoint)
    ) {
      return null
    }
    return { endpoint, taskId }
  } catch {
    return null
  }
}

export function localTaskDeepLinkFromArguments(argv: readonly string[]): string | null {
  return argv.find(isLocalTaskDeepLinkCandidate) ?? null
}
