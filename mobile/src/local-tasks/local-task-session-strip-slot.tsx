import { createContext, useContext, type ComponentProps, type ReactNode } from 'react'
import type { LocalTaskSessionStrip } from './LocalTaskSessionStrip'

export type StripController = ComponentProps<typeof LocalTaskSessionStrip>['controller']

type RenderStrip = (controller: StripController) => ReactNode

/** Filled by the session route, so the header never imports the task strip's native graph. */
export const LocalTaskSessionStripSlot = createContext<RenderStrip | null>(null)

export function LocalTaskSessionStripMount({ controller }: { controller: StripController }) {
  return useContext(LocalTaskSessionStripSlot)?.(controller) ?? null
}
