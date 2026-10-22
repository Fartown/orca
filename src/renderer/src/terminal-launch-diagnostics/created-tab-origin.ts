import { launchField } from '../../../shared/terminal-launch-diagnostics/launch-evidence'
import { recordTerminalLaunchOrigin } from './launch-origin'

export function recordCreatedTerminalTab(
  tab: { id: string },
  worktreeId: string,
  options: unknown,
  state: unknown
): void {
  const startup = launchField(options, 'pendingStartup')
  recordTerminalLaunchOrigin(
    'renderer-tab-created',
    {
      ...(startup != null && typeof startup === 'object' ? startup : {}),
      automaticResumeClaim: launchField(options, 'automaticResumeClaim'),
      tabId: tab.id,
      worktreeId,
      ptyId: launchField(options, 'initialPtyId'),
      eventPhase: 'created'
    },
    state
  )
}
