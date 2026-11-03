import type { ReactNode } from 'react'
import { LocalTaskSessionStrip } from './LocalTaskSessionStrip'
import { LocalTaskSessionStripSlot, type StripController } from './local-task-session-strip-slot'

// A render function, not a component, so the slot does not define a component during render.
const renderStrip = (controller: StripController) => (
  <LocalTaskSessionStrip controller={controller} />
)

export function LocalTaskSessionStripProvider({ children }: { children: ReactNode }) {
  return (
    <LocalTaskSessionStripSlot.Provider value={renderStrip}>
      {children}
    </LocalTaskSessionStripSlot.Provider>
  )
}
