import { useEffect } from 'react'
import { subscribeSidebarProjectMerges } from './sidebar-project-merge-store'

export function SidebarProjectMergeSyncGate(): null {
  useEffect(subscribeSidebarProjectMerges, [])
  return null
}
