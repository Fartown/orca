import { get } from 'node:http'
import type { Server } from 'node:http'
import { z } from 'zod'
import { ARTIFACT_SHARE_SERVICE_NAME } from './artifact-share-identity'

export const ARTIFACT_SHARE_FALLBACK_PORT_MIN = 20_000
export const ARTIFACT_SHARE_FALLBACK_PORT_MAX = 29_999
const FALLBACK_PORT_ATTEMPTS = 25
const IDENTITY_PROBE_TIMEOUT_MS = 1_500

/** `in-use` is the only failure a caller can recover from by choosing another port. */
export function listenOnArtifactSharePort(
  server: Server,
  port: number
): Promise<'listening' | 'in-use'> {
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException): void => {
      server.off('listening', onListening)
      if (error.code === 'EADDRINUSE') {
        resolve('in-use')
        return
      }
      reject(error)
    }
    const onListening = (): void => {
      server.off('error', onError)
      resolve('listening')
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, '0.0.0.0')
  })
}

export async function listenOnFallbackArtifactSharePort(
  server: Server,
  random: () => number = Math.random
): Promise<number | null> {
  const span = ARTIFACT_SHARE_FALLBACK_PORT_MAX - ARTIFACT_SHARE_FALLBACK_PORT_MIN + 1
  for (let attempt = 0; attempt < FALLBACK_PORT_ATTEMPTS; attempt += 1) {
    const port = ARTIFACT_SHARE_FALLBACK_PORT_MIN + Math.floor(random() * span)
    if ((await listenOnArtifactSharePort(server, port)) === 'listening') {
      return port
    }
  }
  return null
}

const IdentityResponse = z.object({
  service: z.literal(ARTIFACT_SHARE_SERVICE_NAME),
  protocol: z.number().int(),
  instance: z.string().min(1)
})

/** Asks whatever holds `port` on this computer whether it is an Orca share server, and which one. */
export function probeArtifactShareIdentity(port: number): Promise<string | null> {
  return new Promise((resolve) => {
    const request = get(
      { host: '127.0.0.1', port, path: '/_share/identity', timeout: IDENTITY_PROBE_TIMEOUT_MS },
      (response) => {
        const chunks: Buffer[] = []
        let size = 0
        response.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > 4_096) {
            request.destroy()
            resolve(null)
            return
          }
          chunks.push(chunk)
        })
        response.on('end', () => {
          try {
            const parsed = IdentityResponse.safeParse(
              JSON.parse(Buffer.concat(chunks).toString('utf8'))
            )
            resolve(parsed.success ? parsed.data.instance : null)
          } catch {
            resolve(null)
          }
        })
        response.on('error', () => resolve(null))
      }
    )
    request.on('timeout', () => {
      request.destroy()
      resolve(null)
    })
    request.on('error', () => resolve(null))
  })
}
