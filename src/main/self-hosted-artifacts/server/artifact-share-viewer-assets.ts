import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

export const ARTIFACT_SHARE_VIEWER_DIR_ENV = 'ORCA_ARTIFACT_SHARE_VIEWER_DIR'
export const ARTIFACT_SHARE_VIEWER_MANIFEST = 'manifest.json'

const ViewerManifest = z.object({
  script: z.string().regex(/^[A-Za-z0-9._-]+\.js$/),
  style: z.string().regex(/^[A-Za-z0-9._-]+\.css$/)
})

export type ArtifactShareViewerAssets = {
  directory: string
  script: string
  style: string
}

/** Same lookup order as the goal driver bundle: env override, packaged resources, dev build output. */
export function resolveArtifactShareViewerAssets(input: {
  env: NodeJS.ProcessEnv
  resourcesPath: string | undefined
  appPath: string | null
}): ArtifactShareViewerAssets | null {
  const candidates: string[] = []
  const override = input.env[ARTIFACT_SHARE_VIEWER_DIR_ENV]?.trim()
  if (override) {
    candidates.push(override)
  }
  if (input.resourcesPath) {
    candidates.push(join(input.resourcesPath, 'artifact-share-viewer'))
  }
  if (input.appPath) {
    candidates.push(join(input.appPath, 'out', 'artifact-share-viewer'))
  }
  for (const directory of candidates) {
    const manifestPath = join(directory, ARTIFACT_SHARE_VIEWER_MANIFEST)
    if (!existsSync(manifestPath)) {
      continue
    }
    try {
      const manifest = ViewerManifest.parse(JSON.parse(readFileSync(manifestPath, 'utf8')))
      return { directory, ...manifest }
    } catch {
      continue
    }
  }
  return null
}
