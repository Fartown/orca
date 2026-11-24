import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { folderWorkspaceKey } from '../../shared/workspace/identity/workspace-scope'
import type { LocalTaskDispatcherWorkspace } from '../../shared/local-tasks/local-task-dispatcher-workspace'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { LocalTasksDatabase } from './local-tasks-database'

export type LocalTaskDispatcherWorkspaceRuntime = Pick<
  OrcaRuntimeService,
  'listProjectGroups' | 'listFolderWorkspaces' | 'createProjectGroup' | 'createFolderWorkspace'
>

function localCatalogRow(row: {
  connectionId?: string | null
  executionHostId?: string | null
}): boolean {
  return !row.connectionId && (!row.executionHostId || row.executionHostId === 'local')
}

/** The selected runtime's profile owns both the directory and its ordinary folder workspace. */
export async function prepareLocalTaskDispatcherWorkspace(
  db: LocalTasksDatabase,
  runtime: LocalTaskDispatcherWorkspaceRuntime
): Promise<LocalTaskDispatcherWorkspace> {
  if (db.path === ':memory:') {
    throw new Error('Dispatcher workspace requires a persistent task profile')
  }
  const folderPath = resolve(dirname(db.path), 'dispatcher')
  const checkOpen = (): void => {
    db.prepare('SELECT 1').get()
  }
  checkOpen()
  await mkdir(folderPath, { recursive: true, mode: 0o700 })
  checkOpen()
  let projectGroup = runtime
    .listProjectGroups()
    .find(
      (group) =>
        localCatalogRow(group) &&
        group.parentPath &&
        resolve(group.parentPath) === resolve(folderPath)
    )
  if (!projectGroup) {
    projectGroup = await runtime.createProjectGroup({
      name: 'Orca',
      parentPath: folderPath,
      connectionId: null
    })
  }
  checkOpen()
  if (
    !localCatalogRow(projectGroup) ||
    !projectGroup.parentPath ||
    resolve(projectGroup.parentPath) !== folderPath
  ) {
    throw new Error('Dispatcher project group does not belong to this profile directory')
  }
  let folderWorkspace = runtime
    .listFolderWorkspaces()
    .find(
      (folder) =>
        !folder.isArchived &&
        localCatalogRow(folder) &&
        folder.projectGroupId === projectGroup.id &&
        resolve(folder.folderPath) === resolve(folderPath)
    )
  if (!folderWorkspace) {
    const created = await runtime.createFolderWorkspace({
      projectGroupId: projectGroup.id,
      name: 'Dispatcher',
      folderPath,
      connectionId: null,
      creatorProvenance: { kind: 'host' }
    })
    folderWorkspace = created.folderWorkspace
  }
  checkOpen()
  if (
    !localCatalogRow(folderWorkspace) ||
    folderWorkspace.projectGroupId !== projectGroup.id ||
    resolve(folderWorkspace.folderPath) !== folderPath
  ) {
    throw new Error('Dispatcher workspace does not belong to this profile directory')
  }
  return {
    ok: true,
    worktreeId: folderWorkspaceKey(folderWorkspace.id),
    folderWorkspace,
    projectGroup
  }
}
