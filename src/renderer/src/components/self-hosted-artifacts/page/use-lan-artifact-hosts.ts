import { useCallback, useEffect, useRef, useState } from 'react'
import type { ArtifactShareHostListing } from '../../../../../shared/self-hosted-artifacts/artifact-share-contract'
import {
  lanArtifactShareErrorMessage,
  listLanArtifactShares,
  stopLanArtifactWorkspace
} from '../client/lan-artifact-share-client'

export function useLanArtifactHosts(): {
  hosts: ArtifactShareHostListing[]
  loading: boolean
  error: string | null
  stoppingToken: string | null
  reload: () => Promise<void>
  stopWorkspace: (executionHostId: string, token: string) => Promise<void>
} {
  const [hosts, setHosts] = useState<ArtifactShareHostListing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stoppingToken, setStoppingToken] = useState<string | null>(null)
  const sequence = useRef(0)

  const reload = useCallback(async (): Promise<void> => {
    const current = ++sequence.current
    setLoading(true)
    try {
      const result = await listLanArtifactShares()
      if (current === sequence.current) {
        setHosts(result.hosts)
        setError(null)
      }
    } catch (listError) {
      if (current === sequence.current) {
        setError(lanArtifactShareErrorMessage(listError))
      }
    } finally {
      if (current === sequence.current) {
        setLoading(false)
      }
    }
  }, [])

  const stopWorkspace = useCallback(
    async (executionHostId: string, token: string): Promise<void> => {
      setStoppingToken(token)
      try {
        await stopLanArtifactWorkspace(executionHostId, token)
        await reload()
      } catch (stopError) {
        setError(lanArtifactShareErrorMessage(stopError))
      } finally {
        setStoppingToken(null)
      }
    },
    [reload]
  )

  useEffect(() => {
    void reload()
  }, [reload])

  return { hosts, loading, error, stoppingToken, reload, stopWorkspace }
}
