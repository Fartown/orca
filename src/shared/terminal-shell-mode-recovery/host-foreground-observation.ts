import { isTerminalForegroundObservation } from '../terminal/pty/lifecycle/terminal-foreground-observation'
import {
  isCurrentForegroundObservation,
  type RemoteForegroundEvidenceAdmission
} from '../terminal/pty/foreground/remote-foreground-evidence-admission'

type CurrentBinding = Pick<
  RemoteForegroundEvidenceAdmission,
  'expectedPtyId' | 'expectedIncarnationId' | 'requestStartedAtMonotonic' | 'receivedAtMonotonic'
>

export function createHostForegroundObservationReader() {
  let binding: string | null = null
  let authority: string | null = null
  let epoch = -1
  const knownAuthorities = new Set<string>()

  return (value: unknown, current: CurrentBinding) => {
    const nextBinding = `${current.expectedPtyId}\0${current.expectedIncarnationId ?? ''}`
    if (binding !== nextBinding) {
      binding = nextBinding
      authority = null
      epoch = -1
      knownAuthorities.clear()
    }
    if (
      !isTerminalForegroundObservation(value) ||
      !isCurrentForegroundObservation(value, {
        ...current,
        lastAuthorityGeneration: authority,
        lastObservationEpoch: epoch,
        knownAuthorityGenerations: knownAuthorities
      })
    ) {
      return null
    }
    authority = value.authorityGeneration
    epoch = value.observationEpoch
    knownAuthorities.add(authority)
    return value
  }
}
