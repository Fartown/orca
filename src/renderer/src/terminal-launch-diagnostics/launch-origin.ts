import { recordRendererCrashBreadcrumb } from '@/lib/crash-breadcrumb-recorder'
import {
  launchCandidateEvidence,
  launchEvidence
} from '../../../shared/terminal-launch-diagnostics/launch-evidence'

export type TerminalLaunchOrigin =
  | 'ai-vault-resume'
  | 'ai-vault-drop-resume'
  | 'ai-vault-reveal-resume'
  | 'queued-startup'
  | 'paired-terminal-create'
  | 'automatic-sleeping-resume'
  | 'cold-restore-resume'
  | 'runtime-tab-create-request'
  | 'renderer-tab-created'

let synchronousOrigin: TerminalLaunchOrigin | undefined

export function currentTerminalLaunchOrigin(): TerminalLaunchOrigin | undefined {
  return synchronousOrigin
}

// Only the synchronous launch call is scoped; completion observers capture their own origin.
export function withTerminalLaunchOrigin<T>(origin: TerminalLaunchOrigin, invoke: () => T): T {
  const previous = synchronousOrigin
  synchronousOrigin = origin
  try {
    return invoke()
  } finally {
    synchronousOrigin = previous
  }
}

export function recordTerminalLaunchOrigin(
  origin: TerminalLaunchOrigin,
  input: unknown,
  state?: unknown
): void {
  try {
    recordRendererCrashBreadcrumb('terminal_launch_origin', {
      origin,
      ...launchEvidence(input),
      ...launchCandidateEvidence(input, state),
      ...launchSourceFrames()
    })
  } catch {
    // Diagnostics must not change launch admission.
  }
}

function launchSourceFrames(): Record<string, string> {
  const frames: Record<string, string> = {}
  const stack = new Error('terminal launch callsite').stack ?? ''
  const matches = stack.matchAll(/([A-Za-z0-9_-]+\.(?:js|ts|tsx)):(\d+):(\d+)/g)
  for (const [index, match] of Array.from(matches).slice(0, 8).entries()) {
    frames[`sourceFrame${index}`] = `${match[1]}:${match[2]}:${match[3]}`
  }
  return frames
}
