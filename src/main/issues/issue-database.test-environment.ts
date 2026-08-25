import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IssueDatabase, type OpenIssueDatabaseOptions } from './issue-database'

const directories: string[] = []

export function createIssueTestUserDataPath(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), `${prefix}-`))
  directories.push(directory)
  return directory
}

export function openIssueTestDatabase(options: OpenIssueDatabaseOptions): IssueDatabase {
  return IssueDatabase.open(options)
}

export function removeIssueTestDirectories(): void {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
}
