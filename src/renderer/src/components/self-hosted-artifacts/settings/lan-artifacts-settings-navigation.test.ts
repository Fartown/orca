import { describe, expect, it } from 'vitest'
import { getOptInOnlyExperimentVisibility } from '@/components/settings/advanced/experimental-search'
import { buildWorkflowSettingsSections } from '@/components/settings/navigation/settings-navigation-workflow-sections'

describe('Artifacts settings navigation', () => {
  it('describes local network sharing, not publishing public links', () => {
    const sections = buildWorkflowSettingsSections(
      {
        isMac: true,
        showWorkspaceCardLayout: false,
        optInOnlyExperiments: getOptInOnlyExperimentVisibility(null),
        isWindows: false,
        isLocalWindowsHost: false,
        isWindowsTerminalHost: false,
        isWebClient: false,
        botsEnabled: false,
        hostQueuesMessages: false,
        managedBrowserCreationEnabled: false,
        mobileEmulatorCreationEnabled: false,
        isDev: false,
        isLinearConnected: false,
        repos: [],
        bots: []
      },
      [],
      (_key, fallback) => fallback
    )
    const artifacts = sections.find((section) => section.id === 'artifacts')

    expect(artifacts?.group).toBe('workflows')
    expect(artifacts?.description).toBe(
      'Share workspace files on your local network from the computer that holds them.'
    )
  })
})
