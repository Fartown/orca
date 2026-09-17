import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { writeDurableSecureJsonFile } from '../../../shared/secure-file'
import { withAgentSessionStoreTransactionLock } from '../../runtime/agent-session-store-transaction-lock'
import {
  ARTIFACT_SHARE_FILE_VERSION,
  readVersionedArtifactShareFile
} from './artifact-share-json-file'
import { artifactShareRecordsPath } from './artifact-share-store-layout'

const MAX_LINKED_FILES_PER_WORKSPACE = 200

const StoredLinkedFile = z.object({
  relativePath: z.string().min(1),
  lastLinkedAt: z.string()
})

const StoredWorkspace = z.object({
  token: z.string().min(1),
  rootPath: z.string().min(1),
  label: z.string().min(1),
  createdAt: z.string(),
  linkedFiles: z.array(StoredLinkedFile)
})
export type StoredArtifactShareWorkspace = z.infer<typeof StoredWorkspace>

const StoredRecords = z.object({
  version: z.number().int(),
  workspaces: z.array(StoredWorkspace)
})
type StoredRecords = z.infer<typeof StoredRecords>

function emptyRecords(): StoredRecords {
  return { version: ARTIFACT_SHARE_FILE_VERSION, workspaces: [] }
}

export function createArtifactShareToken(): string {
  return randomBytes(16).toString('base64url')
}

export function readArtifactShareWorkspaces(home: string): StoredArtifactShareWorkspace[] {
  return (
    readVersionedArtifactShareFile(artifactShareRecordsPath(home), StoredRecords) ?? emptyRecords()
  ).workspaces
}

/** Every change goes through one cross-process lock so the app and a relay never lose each other's writes. */
async function mutateRecords<T>(home: string, apply: (records: StoredRecords) => T): Promise<T> {
  const path = artifactShareRecordsPath(home)
  return withAgentSessionStoreTransactionLock(path, async () => {
    const records = readVersionedArtifactShareFile(path, StoredRecords) ?? emptyRecords()
    const result = apply(records)
    writeDurableSecureJsonFile(path, { ...records, version: ARTIFACT_SHARE_FILE_VERSION })
    return result
  })
}

export function shareArtifactWorkspaceFile(
  home: string,
  input: { rootPath: string; label: string; relativePath: string; now: Date }
): Promise<{ workspace: StoredArtifactShareWorkspace; created: boolean }> {
  return mutateRecords(home, (records) => {
    const timestamp = input.now.toISOString()
    let workspace = records.workspaces.find((candidate) => candidate.rootPath === input.rootPath)
    const created = !workspace
    if (!workspace) {
      workspace = {
        token: createArtifactShareToken(),
        rootPath: input.rootPath,
        label: input.label,
        createdAt: timestamp,
        linkedFiles: []
      }
      records.workspaces.push(workspace)
    }
    workspace.linkedFiles = [
      { relativePath: input.relativePath, lastLinkedAt: timestamp },
      ...workspace.linkedFiles.filter((file) => file.relativePath !== input.relativePath)
    ].slice(0, MAX_LINKED_FILES_PER_WORKSPACE)
    return { workspace, created }
  })
}

/** Removing the record is what revokes the token; a later share mints a new one. */
export function stopArtifactShareWorkspace(home: string, token: string): Promise<boolean> {
  return mutateRecords(home, (records) => {
    const before = records.workspaces.length
    records.workspaces = records.workspaces.filter((workspace) => workspace.token !== token)
    return records.workspaces.length !== before
  })
}
