import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { getHostDisplayLabelOverrides } from '../../../../shared/host-setting-overrides'
import { buildExecutionHostInventory } from '../../../../shared/execution-host-registry'
import {
  buildSidebarHostOptions,
  buildSidebarHostScopeOptions,
  sidebarHostOptionsFromInventory,
  type SidebarHostOption,
  type SidebarHostScopeOption
} from './sidebar-host-options'

/** Shared host-scope derivation for the sidebar scope strip and the workspace
 * options menu so both surfaces consume the same live runtime status without
 * duplicating store wiring. */
export function useSidebarHostScopeOptions(): {
  hostOptions: SidebarHostOption[]
  hostScopeOptions: SidebarHostScopeOption[]
} {
  const inputs = useSidebarHostSourceInputs()
  const hostOptions = useMemo(() => buildSidebarHostOptions(inputs), [inputs])
  const hostScopeOptions = useMemo(() => buildSidebarHostScopeOptions(hostOptions), [hostOptions])
  return { hostOptions, hostScopeOptions }
}

/** Catalog-only consumers must not add the focused runtime as an implied owner. */
export function useSidebarHostInventoryOptions(): SidebarHostOption[] {
  const inputs = useSidebarHostSourceInputs()
  return useMemo(
    () => sidebarHostOptionsFromInventory(inputs, buildExecutionHostInventory(inputs)),
    [inputs]
  )
}

function useSidebarHostSourceInputs() {
  const repos = useAppStore((s) => s.repos)
  const sshTargetLabels = useAppStore((s) => s.sshTargetLabels)
  const sshConnectionStates = useAppStore((s) => s.sshConnectionStates)
  const settings = useAppStore((s) => s.settings)
  const runtimeEnvironments = useAppStore((s) => s.runtimeEnvironments)
  const runtimeStatusByEnvironmentId = useAppStore((s) => s.runtimeStatusByEnvironmentId)
  const wslHostStatuses = useAppStore((s) => s.wslHostStatuses)
  const wslHostServerFilesMissing = useAppStore((s) => s.wslHostServerFiles === 'missing')

  const hostLabelOverrides = useMemo(() => getHostDisplayLabelOverrides(settings), [settings])
  return useMemo(
    () => ({
      repos,
      sshTargetLabels,
      sshConnectionStates,
      settings,
      runtimeEnvironments,
      runtimeStatusByEnvironmentId,
      hostLabelOverrides,
      wslHostStatuses,
      wslHostsEnabled: settings?.experimentalWslHosts === true,
      wslHostServerFilesMissing
    }),
    [
      repos,
      sshTargetLabels,
      sshConnectionStates,
      settings,
      runtimeEnvironments,
      runtimeStatusByEnvironmentId,
      hostLabelOverrides,
      wslHostStatuses,
      wslHostServerFilesMissing
    ]
  )
}
